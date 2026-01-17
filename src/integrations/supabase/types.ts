export type Json =
  | string
  | number
  | boolean
  | null
  | { [key: string]: Json | undefined }
  | Json[]

export type Database = {
  // Allows to automatically instantiate createClient with right options
  // instead of createClient<Database, { PostgrestVersion: 'XX' }>(URL, KEY)
  __InternalSupabase: {
    PostgrestVersion: "14.1"
  }
  public: {
    Tables: {
      field_fuel_records: {
        Row: {
          arla_quantity: number | null
          category: string | null
          company: string | null
          created_at: string | null
          entry_location: string | null
          filter_blow: boolean | null
          filter_blow_quantity: number | null
          fuel_quantity: number
          fuel_type: string | null
          horimeter_current: number | null
          horimeter_previous: number | null
          id: string
          invoice_number: string | null
          km_current: number | null
          km_previous: number | null
          location: string | null
          lubricant: string | null
          observations: string | null
          oil_quantity: number | null
          oil_type: string | null
          operator_name: string | null
          photo_horimeter_url: string | null
          photo_pump_url: string | null
          record_date: string
          record_time: string
          record_type: string | null
          supplier: string | null
          synced_to_sheet: boolean | null
          unit_price: number | null
          updated_at: string | null
          user_id: string | null
          vehicle_code: string
          vehicle_description: string | null
          work_site: string | null
        }
        Insert: {
          arla_quantity?: number | null
          category?: string | null
          company?: string | null
          created_at?: string | null
          entry_location?: string | null
          filter_blow?: boolean | null
          filter_blow_quantity?: number | null
          fuel_quantity: number
          fuel_type?: string | null
          horimeter_current?: number | null
          horimeter_previous?: number | null
          id?: string
          invoice_number?: string | null
          km_current?: number | null
          km_previous?: number | null
          location?: string | null
          lubricant?: string | null
          observations?: string | null
          oil_quantity?: number | null
          oil_type?: string | null
          operator_name?: string | null
          photo_horimeter_url?: string | null
          photo_pump_url?: string | null
          record_date?: string
          record_time?: string
          record_type?: string | null
          supplier?: string | null
          synced_to_sheet?: boolean | null
          unit_price?: number | null
          updated_at?: string | null
          user_id?: string | null
          vehicle_code: string
          vehicle_description?: string | null
          work_site?: string | null
        }
        Update: {
          arla_quantity?: number | null
          category?: string | null
          company?: string | null
          created_at?: string | null
          entry_location?: string | null
          filter_blow?: boolean | null
          filter_blow_quantity?: number | null
          fuel_quantity?: number
          fuel_type?: string | null
          horimeter_current?: number | null
          horimeter_previous?: number | null
          id?: string
          invoice_number?: string | null
          km_current?: number | null
          km_previous?: number | null
          location?: string | null
          lubricant?: string | null
          observations?: string | null
          oil_quantity?: number | null
          oil_type?: string | null
          operator_name?: string | null
          photo_horimeter_url?: string | null
          photo_pump_url?: string | null
          record_date?: string
          record_time?: string
          record_type?: string | null
          supplier?: string | null
          synced_to_sheet?: boolean | null
          unit_price?: number | null
          updated_at?: string | null
          user_id?: string | null
          vehicle_code?: string
          vehicle_description?: string | null
          work_site?: string | null
        }
        Relationships: [
          {
            foreignKeyName: "field_fuel_records_user_id_fkey"
            columns: ["user_id"]
            isOneToOne: false
            referencedRelation: "field_users"
            referencedColumns: ["id"]
          },
        ]
      }
      field_record_requests: {
        Row: {
          created_at: string
          id: string
          proposed_changes: Json | null
          record_id: string
          request_reason: string | null
          request_type: string
          requested_at: string
          requested_by: string
          review_notes: string | null
          reviewed_at: string | null
          reviewed_by: string | null
          reviewer_name: string | null
          status: string
          updated_at: string
        }
        Insert: {
          created_at?: string
          id?: string
          proposed_changes?: Json | null
          record_id: string
          request_reason?: string | null
          request_type: string
          requested_at?: string
          requested_by: string
          review_notes?: string | null
          reviewed_at?: string | null
          reviewed_by?: string | null
          reviewer_name?: string | null
          status?: string
          updated_at?: string
        }
        Update: {
          created_at?: string
          id?: string
          proposed_changes?: Json | null
          record_id?: string
          request_reason?: string | null
          request_type?: string
          requested_at?: string
          requested_by?: string
          review_notes?: string | null
          reviewed_at?: string | null
          reviewed_by?: string | null
          reviewer_name?: string | null
          status?: string
          updated_at?: string
        }
        Relationships: [
          {
            foreignKeyName: "field_record_requests_record_id_fkey"
            columns: ["record_id"]
            isOneToOne: false
            referencedRelation: "field_fuel_records"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "field_record_requests_requested_by_fkey"
            columns: ["requested_by"]
            isOneToOne: false
            referencedRelation: "field_users"
            referencedColumns: ["id"]
          },
        ]
      }
      field_users: {
        Row: {
          active: boolean | null
          assigned_locations: string[] | null
          created_at: string | null
          id: string
          name: string
          password_hash: string
          required_fields: Json | null
          role: string | null
          updated_at: string | null
          username: string
        }
        Insert: {
          active?: boolean | null
          assigned_locations?: string[] | null
          created_at?: string | null
          id?: string
          name: string
          password_hash: string
          required_fields?: Json | null
          role?: string | null
          updated_at?: string | null
          username: string
        }
        Update: {
          active?: boolean | null
          assigned_locations?: string[] | null
          created_at?: string | null
          id?: string
          name?: string
          password_hash?: string
          required_fields?: Json | null
          role?: string | null
          updated_at?: string | null
          username?: string
        }
        Relationships: []
      }
      horimeter_inconsistency_alerts: {
        Row: {
          created_at: string
          current_value: number
          difference: number
          id: string
          operator: string | null
          previous_value: number
          reading_date: string
          reading_id: string | null
          resolution_notes: string | null
          resolved_at: string | null
          resolved_by: string | null
          status: string
          updated_at: string
          value_type: string
          vehicle_code: string
          vehicle_id: string
          vehicle_name: string | null
        }
        Insert: {
          created_at?: string
          current_value: number
          difference: number
          id?: string
          operator?: string | null
          previous_value: number
          reading_date: string
          reading_id?: string | null
          resolution_notes?: string | null
          resolved_at?: string | null
          resolved_by?: string | null
          status?: string
          updated_at?: string
          value_type: string
          vehicle_code: string
          vehicle_id: string
          vehicle_name?: string | null
        }
        Update: {
          created_at?: string
          current_value?: number
          difference?: number
          id?: string
          operator?: string | null
          previous_value?: number
          reading_date?: string
          reading_id?: string | null
          resolution_notes?: string | null
          resolved_at?: string | null
          resolved_by?: string | null
          status?: string
          updated_at?: string
          value_type?: string
          vehicle_code?: string
          vehicle_id?: string
          vehicle_name?: string | null
        }
        Relationships: [
          {
            foreignKeyName: "horimeter_inconsistency_alerts_reading_id_fkey"
            columns: ["reading_id"]
            isOneToOne: false
            referencedRelation: "horimeter_readings"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "horimeter_inconsistency_alerts_vehicle_id_fkey"
            columns: ["vehicle_id"]
            isOneToOne: false
            referencedRelation: "vehicles"
            referencedColumns: ["id"]
          },
        ]
      }
      horimeter_readings: {
        Row: {
          created_at: string
          current_km: number | null
          current_value: number
          id: string
          observations: string | null
          operator: string | null
          previous_km: number | null
          previous_value: number | null
          reading_date: string
          source: string | null
          synced_from_sheet: boolean | null
          updated_at: string
          vehicle_id: string
        }
        Insert: {
          created_at?: string
          current_km?: number | null
          current_value: number
          id?: string
          observations?: string | null
          operator?: string | null
          previous_km?: number | null
          previous_value?: number | null
          reading_date: string
          source?: string | null
          synced_from_sheet?: boolean | null
          updated_at?: string
          vehicle_id: string
        }
        Update: {
          created_at?: string
          current_km?: number | null
          current_value?: number
          id?: string
          observations?: string | null
          operator?: string | null
          previous_km?: number | null
          previous_value?: number | null
          reading_date?: string
          source?: string | null
          synced_from_sheet?: boolean | null
          updated_at?: string
          vehicle_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "horimeter_readings_vehicle_id_fkey"
            columns: ["vehicle_id"]
            isOneToOne: false
            referencedRelation: "vehicles"
            referencedColumns: ["id"]
          },
        ]
      }
      kpi_mappings: {
        Row: {
          column_name: string
          created_at: string
          id: string
          kpi_id: string
          sheet_name: string
          updated_at: string
          user_identifier: string
        }
        Insert: {
          column_name: string
          created_at?: string
          id?: string
          kpi_id: string
          sheet_name: string
          updated_at?: string
          user_identifier?: string
        }
        Update: {
          column_name?: string
          created_at?: string
          id?: string
          kpi_id?: string
          sheet_name?: string
          updated_at?: string
          user_identifier?: string
        }
        Relationships: []
      }
      layout_preferences: {
        Row: {
          column_config: Json
          created_at: string
          id: string
          module_name: string
          updated_at: string
          user_identifier: string
        }
        Insert: {
          column_config?: Json
          created_at?: string
          id?: string
          module_name: string
          updated_at?: string
          user_identifier: string
        }
        Update: {
          column_config?: Json
          created_at?: string
          id?: string
          module_name?: string
          updated_at?: string
          user_identifier?: string
        }
        Relationships: []
      }
      lubricants: {
        Row: {
          active: boolean | null
          created_at: string
          description: string | null
          id: string
          name: string
          type: string | null
          unit: string | null
          updated_at: string
        }
        Insert: {
          active?: boolean | null
          created_at?: string
          description?: string | null
          id?: string
          name: string
          type?: string | null
          unit?: string | null
          updated_at?: string
        }
        Update: {
          active?: boolean | null
          created_at?: string
          description?: string | null
          id?: string
          name?: string
          type?: string | null
          unit?: string | null
          updated_at?: string
        }
        Relationships: []
      }
      mechanics: {
        Row: {
          active: boolean
          created_at: string
          id: string
          name: string
          phone: string | null
          specialty: string | null
          updated_at: string
        }
        Insert: {
          active?: boolean
          created_at?: string
          id?: string
          name: string
          phone?: string | null
          specialty?: string | null
          updated_at?: string
        }
        Update: {
          active?: boolean
          created_at?: string
          id?: string
          name?: string
          phone?: string | null
          specialty?: string | null
          updated_at?: string
        }
        Relationships: []
      }
      obra_settings: {
        Row: {
          cidade: string | null
          created_at: string
          id: string
          logo_url: string | null
          nome: string
          subtitulo: string | null
          updated_at: string
        }
        Insert: {
          cidade?: string | null
          created_at?: string
          id?: string
          logo_url?: string | null
          nome?: string
          subtitulo?: string | null
          updated_at?: string
        }
        Update: {
          cidade?: string | null
          created_at?: string
          id?: string
          logo_url?: string | null
          nome?: string
          subtitulo?: string | null
          updated_at?: string
        }
        Relationships: []
      }
      oil_types: {
        Row: {
          active: boolean | null
          created_at: string
          description: string | null
          id: string
          name: string
          updated_at: string
        }
        Insert: {
          active?: boolean | null
          created_at?: string
          description?: string | null
          id?: string
          name: string
          updated_at?: string
        }
        Update: {
          active?: boolean | null
          created_at?: string
          description?: string | null
          id?: string
          name?: string
          updated_at?: string
        }
        Relationships: []
      }
      scheduled_maintenance: {
        Row: {
          created_at: string
          description: string | null
          id: string
          interval_days: number | null
          interval_hours: number | null
          last_completed_date: string | null
          maintenance_type: string
          notes: string | null
          priority: string | null
          scheduled_date: string
          status: string
          title: string
          updated_at: string
          vehicle_code: string
          vehicle_description: string | null
        }
        Insert: {
          created_at?: string
          description?: string | null
          id?: string
          interval_days?: number | null
          interval_hours?: number | null
          last_completed_date?: string | null
          maintenance_type?: string
          notes?: string | null
          priority?: string | null
          scheduled_date: string
          status?: string
          title: string
          updated_at?: string
          vehicle_code: string
          vehicle_description?: string | null
        }
        Update: {
          created_at?: string
          description?: string | null
          id?: string
          interval_days?: number | null
          interval_hours?: number | null
          last_completed_date?: string | null
          maintenance_type?: string
          notes?: string | null
          priority?: string | null
          scheduled_date?: string
          status?: string
          title?: string
          updated_at?: string
          vehicle_code?: string
          vehicle_description?: string | null
        }
        Relationships: []
      }
      service_orders: {
        Row: {
          actual_hours: number | null
          created_at: string
          created_by: string | null
          end_date: string | null
          entry_date: string | null
          entry_time: string | null
          estimated_hours: number | null
          horimeter_current: number | null
          id: string
          interval_days: number | null
          km_current: number | null
          labor_cost: number | null
          mechanic_id: string | null
          mechanic_name: string | null
          notes: string | null
          order_date: string
          order_number: string
          order_type: string
          parts_cost: number | null
          parts_used: string | null
          photo_after_url: string | null
          photo_before_url: string | null
          photo_parts_url: string | null
          priority: string
          problem_description: string | null
          solution_description: string | null
          start_date: string | null
          status: string
          total_cost: number | null
          updated_at: string
          vehicle_code: string
          vehicle_description: string | null
        }
        Insert: {
          actual_hours?: number | null
          created_at?: string
          created_by?: string | null
          end_date?: string | null
          entry_date?: string | null
          entry_time?: string | null
          estimated_hours?: number | null
          horimeter_current?: number | null
          id?: string
          interval_days?: number | null
          km_current?: number | null
          labor_cost?: number | null
          mechanic_id?: string | null
          mechanic_name?: string | null
          notes?: string | null
          order_date?: string
          order_number: string
          order_type?: string
          parts_cost?: number | null
          parts_used?: string | null
          photo_after_url?: string | null
          photo_before_url?: string | null
          photo_parts_url?: string | null
          priority?: string
          problem_description?: string | null
          solution_description?: string | null
          start_date?: string | null
          status?: string
          total_cost?: number | null
          updated_at?: string
          vehicle_code: string
          vehicle_description?: string | null
        }
        Update: {
          actual_hours?: number | null
          created_at?: string
          created_by?: string | null
          end_date?: string | null
          entry_date?: string | null
          entry_time?: string | null
          estimated_hours?: number | null
          horimeter_current?: number | null
          id?: string
          interval_days?: number | null
          km_current?: number | null
          labor_cost?: number | null
          mechanic_id?: string | null
          mechanic_name?: string | null
          notes?: string | null
          order_date?: string
          order_number?: string
          order_type?: string
          parts_cost?: number | null
          parts_used?: string | null
          photo_after_url?: string | null
          photo_before_url?: string | null
          photo_parts_url?: string | null
          priority?: string
          problem_description?: string | null
          solution_description?: string | null
          start_date?: string | null
          status?: string
          total_cost?: number | null
          updated_at?: string
          vehicle_code?: string
          vehicle_description?: string | null
        }
        Relationships: [
          {
            foreignKeyName: "service_orders_mechanic_id_fkey"
            columns: ["mechanic_id"]
            isOneToOne: false
            referencedRelation: "mechanics"
            referencedColumns: ["id"]
          },
        ]
      }
      suppliers: {
        Row: {
          active: boolean
          address: string | null
          cnpj: string | null
          created_at: string
          email: string | null
          id: string
          name: string
          phone: string | null
          updated_at: string
        }
        Insert: {
          active?: boolean
          address?: string | null
          cnpj?: string | null
          created_at?: string
          email?: string | null
          id?: string
          name: string
          phone?: string | null
          updated_at?: string
        }
        Update: {
          active?: boolean
          address?: string | null
          cnpj?: string | null
          created_at?: string
          email?: string | null
          id?: string
          name?: string
          phone?: string | null
          updated_at?: string
        }
        Relationships: []
      }
      system_users: {
        Row: {
          active: boolean | null
          created_at: string | null
          email: string | null
          id: string
          last_login: string | null
          name: string
          password_hash: string
          role: Database["public"]["Enums"]["system_user_role"] | null
          updated_at: string | null
          username: string
        }
        Insert: {
          active?: boolean | null
          created_at?: string | null
          email?: string | null
          id?: string
          last_login?: string | null
          name: string
          password_hash: string
          role?: Database["public"]["Enums"]["system_user_role"] | null
          updated_at?: string | null
          username: string
        }
        Update: {
          active?: boolean | null
          created_at?: string | null
          email?: string | null
          id?: string
          last_login?: string | null
          name?: string
          password_hash?: string
          role?: Database["public"]["Enums"]["system_user_role"] | null
          updated_at?: string | null
          username?: string
        }
        Relationships: []
      }
      vehicles: {
        Row: {
          category: string | null
          code: string
          company: string | null
          created_at: string
          description: string | null
          id: string
          name: string
          status: string | null
          unit: string | null
          updated_at: string
        }
        Insert: {
          category?: string | null
          code: string
          company?: string | null
          created_at?: string
          description?: string | null
          id?: string
          name: string
          status?: string | null
          unit?: string | null
          updated_at?: string
        }
        Update: {
          category?: string | null
          code?: string
          company?: string | null
          created_at?: string
          description?: string | null
          id?: string
          name?: string
          status?: string | null
          unit?: string | null
          updated_at?: string
        }
        Relationships: []
      }
    }
    Views: {
      [_ in never]: never
    }
    Functions: {
      [_ in never]: never
    }
    Enums: {
      system_user_role: "admin" | "supervisor" | "operador"
    }
    CompositeTypes: {
      [_ in never]: never
    }
  }
}

type DatabaseWithoutInternals = Omit<Database, "__InternalSupabase">

type DefaultSchema = DatabaseWithoutInternals[Extract<keyof Database, "public">]

export type Tables<
  DefaultSchemaTableNameOrOptions extends
    | keyof (DefaultSchema["Tables"] & DefaultSchema["Views"])
    | { schema: keyof DatabaseWithoutInternals },
  TableName extends DefaultSchemaTableNameOrOptions extends {
    schema: keyof DatabaseWithoutInternals
  }
    ? keyof (DatabaseWithoutInternals[DefaultSchemaTableNameOrOptions["schema"]]["Tables"] &
        DatabaseWithoutInternals[DefaultSchemaTableNameOrOptions["schema"]]["Views"])
    : never = never,
> = DefaultSchemaTableNameOrOptions extends {
  schema: keyof DatabaseWithoutInternals
}
  ? (DatabaseWithoutInternals[DefaultSchemaTableNameOrOptions["schema"]]["Tables"] &
      DatabaseWithoutInternals[DefaultSchemaTableNameOrOptions["schema"]]["Views"])[TableName] extends {
      Row: infer R
    }
    ? R
    : never
  : DefaultSchemaTableNameOrOptions extends keyof (DefaultSchema["Tables"] &
        DefaultSchema["Views"])
    ? (DefaultSchema["Tables"] &
        DefaultSchema["Views"])[DefaultSchemaTableNameOrOptions] extends {
        Row: infer R
      }
      ? R
      : never
    : never

export type TablesInsert<
  DefaultSchemaTableNameOrOptions extends
    | keyof DefaultSchema["Tables"]
    | { schema: keyof DatabaseWithoutInternals },
  TableName extends DefaultSchemaTableNameOrOptions extends {
    schema: keyof DatabaseWithoutInternals
  }
    ? keyof DatabaseWithoutInternals[DefaultSchemaTableNameOrOptions["schema"]]["Tables"]
    : never = never,
> = DefaultSchemaTableNameOrOptions extends {
  schema: keyof DatabaseWithoutInternals
}
  ? DatabaseWithoutInternals[DefaultSchemaTableNameOrOptions["schema"]]["Tables"][TableName] extends {
      Insert: infer I
    }
    ? I
    : never
  : DefaultSchemaTableNameOrOptions extends keyof DefaultSchema["Tables"]
    ? DefaultSchema["Tables"][DefaultSchemaTableNameOrOptions] extends {
        Insert: infer I
      }
      ? I
      : never
    : never

export type TablesUpdate<
  DefaultSchemaTableNameOrOptions extends
    | keyof DefaultSchema["Tables"]
    | { schema: keyof DatabaseWithoutInternals },
  TableName extends DefaultSchemaTableNameOrOptions extends {
    schema: keyof DatabaseWithoutInternals
  }
    ? keyof DatabaseWithoutInternals[DefaultSchemaTableNameOrOptions["schema"]]["Tables"]
    : never = never,
> = DefaultSchemaTableNameOrOptions extends {
  schema: keyof DatabaseWithoutInternals
}
  ? DatabaseWithoutInternals[DefaultSchemaTableNameOrOptions["schema"]]["Tables"][TableName] extends {
      Update: infer U
    }
    ? U
    : never
  : DefaultSchemaTableNameOrOptions extends keyof DefaultSchema["Tables"]
    ? DefaultSchema["Tables"][DefaultSchemaTableNameOrOptions] extends {
        Update: infer U
      }
      ? U
      : never
    : never

export type Enums<
  DefaultSchemaEnumNameOrOptions extends
    | keyof DefaultSchema["Enums"]
    | { schema: keyof DatabaseWithoutInternals },
  EnumName extends DefaultSchemaEnumNameOrOptions extends {
    schema: keyof DatabaseWithoutInternals
  }
    ? keyof DatabaseWithoutInternals[DefaultSchemaEnumNameOrOptions["schema"]]["Enums"]
    : never = never,
> = DefaultSchemaEnumNameOrOptions extends {
  schema: keyof DatabaseWithoutInternals
}
  ? DatabaseWithoutInternals[DefaultSchemaEnumNameOrOptions["schema"]]["Enums"][EnumName]
  : DefaultSchemaEnumNameOrOptions extends keyof DefaultSchema["Enums"]
    ? DefaultSchema["Enums"][DefaultSchemaEnumNameOrOptions]
    : never

export type CompositeTypes<
  PublicCompositeTypeNameOrOptions extends
    | keyof DefaultSchema["CompositeTypes"]
    | { schema: keyof DatabaseWithoutInternals },
  CompositeTypeName extends PublicCompositeTypeNameOrOptions extends {
    schema: keyof DatabaseWithoutInternals
  }
    ? keyof DatabaseWithoutInternals[PublicCompositeTypeNameOrOptions["schema"]]["CompositeTypes"]
    : never = never,
> = PublicCompositeTypeNameOrOptions extends {
  schema: keyof DatabaseWithoutInternals
}
  ? DatabaseWithoutInternals[PublicCompositeTypeNameOrOptions["schema"]]["CompositeTypes"][CompositeTypeName]
  : PublicCompositeTypeNameOrOptions extends keyof DefaultSchema["CompositeTypes"]
    ? DefaultSchema["CompositeTypes"][PublicCompositeTypeNameOrOptions]
    : never

export const Constants = {
  public: {
    Enums: {
      system_user_role: ["admin", "supervisor", "operador"],
    },
  },
} as const
