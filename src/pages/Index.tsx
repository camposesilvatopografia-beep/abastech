import { useState, useCallback } from 'react';
import { Header } from '@/components/Dashboard/Header';
import { SheetSelector } from '@/components/Dashboard/SheetSelector';
import { DataTable } from '@/components/Dashboard/DataTable';
import { RecordModal } from '@/components/Dashboard/RecordModal';
import { DeleteConfirmModal } from '@/components/Dashboard/DeleteConfirmModal';
import { EmptyState } from '@/components/Dashboard/EmptyState';
import { useSheetNames, useSheetData } from '@/hooks/useGoogleSheets';
import { SheetRow } from '@/lib/googleSheets';

const Index = () => {
  const [selectedSheet, setSelectedSheet] = useState<string | null>(null);
  const [modalOpen, setModalOpen] = useState(false);
  const [modalMode, setModalMode] = useState<'create' | 'edit'>('create');
  const [editingRow, setEditingRow] = useState<SheetRow | null>(null);
  const [deleteModalOpen, setDeleteModalOpen] = useState(false);
  const [deletingRow, setDeletingRow] = useState<SheetRow | null>(null);

  const { sheetNames, loading: sheetsLoading, refetch: refetchSheets } = useSheetNames();
  const { data, loading: dataLoading, refetch: refetchData, create, update, remove } = useSheetData(selectedSheet);

  const handleRefresh = useCallback(() => {
    refetchSheets();
    if (selectedSheet) {
      refetchData();
    }
  }, [refetchSheets, refetchData, selectedSheet]);

  const handleCreate = () => {
    setModalMode('create');
    setEditingRow(null);
    setModalOpen(true);
  };

  const handleEdit = (row: SheetRow) => {
    setModalMode('edit');
    setEditingRow(row);
    setModalOpen(true);
  };

  const handleDelete = (row: SheetRow) => {
    setDeletingRow(row);
    setDeleteModalOpen(true);
  };

  const handleSave = async (formData: Record<string, string>) => {
    if (modalMode === 'create') {
      await create(formData);
    } else if (editingRow?._rowIndex) {
      await update(editingRow._rowIndex, formData);
    }
  };

  const handleConfirmDelete = async () => {
    if (deletingRow?._rowIndex) {
      await remove(deletingRow._rowIndex);
    }
  };

  return (
    <div className="min-h-screen bg-background flex flex-col">
      <Header onRefresh={handleRefresh} isLoading={sheetsLoading || dataLoading} />
      
      <div className="flex-1 flex overflow-hidden">
        <SheetSelector
          sheets={sheetNames}
          selectedSheet={selectedSheet}
          onSelect={setSelectedSheet}
          loading={sheetsLoading}
        />
        
        {selectedSheet ? (
          <DataTable
            headers={data.headers}
            rows={data.rows}
            loading={dataLoading}
            onEdit={handleEdit}
            onDelete={handleDelete}
            onCreate={handleCreate}
          />
        ) : (
          <EmptyState />
        )}
      </div>

      <RecordModal
        open={modalOpen}
        onClose={() => setModalOpen(false)}
        headers={data.headers}
        row={editingRow}
        onSave={handleSave}
        mode={modalMode}
      />

      <DeleteConfirmModal
        open={deleteModalOpen}
        onClose={() => setDeleteModalOpen(false)}
        row={deletingRow}
        onConfirm={handleConfirmDelete}
      />
    </div>
  );
};

export default Index;
