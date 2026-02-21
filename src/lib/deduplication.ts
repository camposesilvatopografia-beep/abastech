import { supabase } from '@/integrations/supabase/client';

interface DuplicateCheckParams {
  vehicle_code: string;
  record_date: string; // yyyy-MM-dd
  fuel_quantity: number;
  record_type?: string;
  record_time?: string; // HH:mm
}

/**
 * Check if a fuel record already exists with the same vehicle, date, quantity, and type.
 * Returns the duplicate record if found, or null if no duplicate.
 */
export async function checkDuplicateFuelRecord(params: DuplicateCheckParams): Promise<{ id: string; record_time: string } | null> {
  const { vehicle_code, record_date, fuel_quantity, record_type, record_time } = params;

  try {
    let query = supabase
      .from('field_fuel_records')
      .select('id, record_time, fuel_quantity, created_at')
      .eq('vehicle_code', vehicle_code)
      .eq('record_date', record_date)
      .eq('fuel_quantity', fuel_quantity);

    if (record_type) {
      query = query.eq('record_type', record_type);
    }

    const { data, error } = await query;

    if (error || !data || data.length === 0) return null;

    // If we have a record_time, check if any match is within 5 minutes
    if (record_time) {
      const [h, m] = record_time.split(':').map(Number);
      const currentMinutes = h * 60 + m;

      for (const record of data) {
        const rt = record.record_time || '';
        const [rh, rm] = rt.split(':').map(Number);
        if (!isNaN(rh) && !isNaN(rm)) {
          const diff = Math.abs(currentMinutes - (rh * 60 + rm));
          if (diff <= 5) {
            return { id: record.id, record_time: rt };
          }
        }
      }
      // No time-close match found — still flag if exact same qty on same day for same vehicle
      // Only flag if there are records with exact same quantity (already filtered above)
      if (data.length > 0) {
        return { id: data[0].id, record_time: data[0].record_time };
      }
    }

    // No record_time provided, any match on vehicle+date+qty is a duplicate
    return { id: data[0].id, record_time: data[0].record_time };
  } catch (err) {
    console.error('[Deduplication] Error checking duplicates:', err);
    return null; // Don't block on errors
  }
}

/**
 * Clean up duplicate records in the database for a given date range.
 * Keeps the oldest record (first created_at) and deletes newer duplicates.
 * Returns the number of deleted records.
 */
export async function cleanupDuplicateRecords(recordDate?: string): Promise<number> {
  try {
    let query = supabase
      .from('field_fuel_records')
      .select('id, vehicle_code, record_date, fuel_quantity, record_type, record_time, created_at')
      .order('created_at', { ascending: true });

    if (recordDate) {
      query = query.eq('record_date', recordDate);
    } else {
      // Default: last 7 days
      const sevenDaysAgo = new Date();
      sevenDaysAgo.setDate(sevenDaysAgo.getDate() - 7);
      query = query.gte('record_date', sevenDaysAgo.toISOString().split('T')[0]);
    }

    const { data, error } = await query;
    if (error || !data) return 0;

    // Group by vehicle_code + record_date + fuel_quantity + record_type
    const groups = new Map<string, typeof data>();
    for (const record of data) {
      const key = `${record.vehicle_code}|${record.record_date}|${record.fuel_quantity}|${record.record_type || ''}`;
      const group = groups.get(key) || [];
      group.push(record);
      groups.set(key, group);
    }

    const idsToDelete: string[] = [];
    for (const [, group] of groups) {
      if (group.length <= 1) continue;

      // Check time proximity — group records within 5 min windows
      const timeGroups: (typeof data)[] = [];
      for (const record of group) {
        const rt = record.record_time || '00:00';
        const [h, m] = rt.split(':').map(Number);
        const mins = (isNaN(h) ? 0 : h) * 60 + (isNaN(m) ? 0 : m);

        let placed = false;
        for (const tg of timeGroups) {
          const trt = tg[0].record_time || '00:00';
          const [th, tm] = trt.split(':').map(Number);
          const tmins = (isNaN(th) ? 0 : th) * 60 + (isNaN(tm) ? 0 : tm);
          if (Math.abs(mins - tmins) <= 5) {
            tg.push(record);
            placed = true;
            break;
          }
        }
        if (!placed) {
          timeGroups.push([record]);
        }
      }

      // For each time group with >1 records, keep oldest, mark rest for deletion
      for (const tg of timeGroups) {
        if (tg.length <= 1) continue;
        // Already sorted by created_at ascending, so first is oldest
        for (let i = 1; i < tg.length; i++) {
          idsToDelete.push(tg[i].id);
        }
      }
    }

    if (idsToDelete.length === 0) return 0;

    // Delete in batches
    const batchSize = 50;
    let deleted = 0;
    for (let i = 0; i < idsToDelete.length; i += batchSize) {
      const batch = idsToDelete.slice(i, i + batchSize);
      const { error: delError } = await supabase
        .from('field_fuel_records')
        .delete()
        .in('id', batch);

      if (!delError) {
        deleted += batch.length;
      } else {
        console.error('[Deduplication] Error deleting batch:', delError);
      }
    }

    console.log(`[Deduplication] Cleaned up ${deleted} duplicate records`);
    return deleted;
  } catch (err) {
    console.error('[Deduplication] Error in cleanup:', err);
    return 0;
  }
}
