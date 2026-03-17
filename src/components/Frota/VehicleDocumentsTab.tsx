import { useState, useEffect, useRef } from 'react';
import {
  FileText,
  Upload,
  Trash2,
  Download,
  Plus,
  Loader2,
  Eye,
  Calendar,
  Tag,
  File,
  Image,
  FileSpreadsheet,
} from 'lucide-react';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Textarea } from '@/components/ui/textarea';
import { Badge } from '@/components/ui/badge';
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '@/components/ui/select';
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
} from '@/components/ui/dialog';
import {
  AlertDialog,
  AlertDialogAction,
  AlertDialogCancel,
  AlertDialogContent,
  AlertDialogDescription,
  AlertDialogFooter,
  AlertDialogHeader,
  AlertDialogTitle,
} from '@/components/ui/alert-dialog';
import { ScrollArea } from '@/components/ui/scroll-area';
import { supabase } from '@/integrations/supabase/client';
import { toast } from 'sonner';
import { format } from 'date-fns';
import { ptBR } from 'date-fns/locale';
import { cn } from '@/lib/utils';

const DOCUMENT_TYPES = [
  'Ordem de Serviço',
  'Checklist',
  'Laudo Técnico',
  'Nota Fiscal',
  'Relatório',
  'Foto',
  'Certificado',
  'Manual',
  'Outro',
];

interface VehicleDocument {
  id: string;
  vehicle_code: string;
  vehicle_description: string | null;
  document_type: string;
  title: string;
  description: string | null;
  document_date: string | null;
  file_url: string;
  file_name: string | null;
  file_size: number | null;
  uploaded_by: string | null;
  created_at: string;
}

interface VehicleDocumentsTabProps {
  vehicleCode: string;
  vehicleDescription: string;
}

export function VehicleDocumentsTab({ vehicleCode, vehicleDescription }: VehicleDocumentsTabProps) {
  const [documents, setDocuments] = useState<VehicleDocument[]>([]);
  const [loading, setLoading] = useState(true);
  const [showUpload, setShowUpload] = useState(false);
  const [uploading, setUploading] = useState(false);
  const [deleteId, setDeleteId] = useState<string | null>(null);
  const [previewUrl, setPreviewUrl] = useState<string | null>(null);

  // Upload form
  const [title, setTitle] = useState('');
  const [docType, setDocType] = useState('Ordem de Serviço');
  const [description, setDescription] = useState('');
  const [documentDate, setDocumentDate] = useState('');
  const [selectedFile, setSelectedFile] = useState<File | null>(null);
  const fileInputRef = useRef<HTMLInputElement>(null);

  const fetchDocuments = async () => {
    setLoading(true);
    const { data, error } = await supabase
      .from('vehicle_documents')
      .select('*')
      .eq('vehicle_code', vehicleCode)
      .order('document_date', { ascending: false, nullsFirst: false });
    if (data) setDocuments(data as VehicleDocument[]);
    if (error) console.error(error);
    setLoading(false);
  };

  useEffect(() => {
    fetchDocuments();
  }, [vehicleCode]);

  const resetForm = () => {
    setTitle('');
    setDocType('Ordem de Serviço');
    setDescription('');
    setDocumentDate('');
    setSelectedFile(null);
    if (fileInputRef.current) fileInputRef.current.value = '';
  };

  const handleUpload = async () => {
    if (!selectedFile || !title.trim()) {
      toast.error('Preencha o título e selecione um arquivo');
      return;
    }

    setUploading(true);
    try {
      // Upload file to storage
      const ext = selectedFile.name.split('.').pop();
      const filePath = `${vehicleCode}/${Date.now()}-${title.replace(/[^a-zA-Z0-9]/g, '_')}.${ext}`;

      const { error: uploadError } = await supabase.storage
        .from('vehicle-documents')
        .upload(filePath, selectedFile);

      if (uploadError) throw uploadError;

      const { data: urlData } = supabase.storage
        .from('vehicle-documents')
        .getPublicUrl(filePath);

      // Save record
      const { error: insertError } = await supabase
        .from('vehicle_documents')
        .insert({
          vehicle_code: vehicleCode,
          vehicle_description: vehicleDescription,
          document_type: docType,
          title: title.trim(),
          description: description.trim() || null,
          document_date: documentDate || null,
          file_url: urlData.publicUrl,
          file_name: selectedFile.name,
          file_size: selectedFile.size,
        });

      if (insertError) throw insertError;

      toast.success('Documento anexado com sucesso!');
      setShowUpload(false);
      resetForm();
      fetchDocuments();
    } catch (err: any) {
      console.error(err);
      toast.error('Erro ao enviar documento: ' + (err.message || ''));
    } finally {
      setUploading(false);
    }
  };

  const handleDelete = async () => {
    if (!deleteId) return;
    const doc = documents.find(d => d.id === deleteId);
    if (!doc) return;

    try {
      // Extract path from URL for storage deletion
      const urlParts = doc.file_url.split('/vehicle-documents/');
      if (urlParts[1]) {
        await supabase.storage.from('vehicle-documents').remove([decodeURIComponent(urlParts[1])]);
      }

      const { error } = await supabase.from('vehicle_documents').delete().eq('id', deleteId);
      if (error) throw error;

      toast.success('Documento removido');
      setDeleteId(null);
      fetchDocuments();
    } catch (err: any) {
      toast.error('Erro ao remover: ' + err.message);
    }
  };

  const getFileIcon = (fileName: string | null) => {
    if (!fileName) return <File className="h-5 w-5" />;
    const ext = fileName.split('.').pop()?.toLowerCase();
    if (['jpg', 'jpeg', 'png', 'webp', 'gif', 'bmp'].includes(ext || '')) return <Image className="h-5 w-5 text-green-600" />;
    if (['pdf'].includes(ext || '')) return <FileText className="h-5 w-5 text-red-600" />;
    if (['xls', 'xlsx', 'csv'].includes(ext || '')) return <FileSpreadsheet className="h-5 w-5 text-emerald-600" />;
    return <File className="h-5 w-5 text-muted-foreground" />;
  };

  const formatSize = (bytes: number | null) => {
    if (!bytes) return '';
    if (bytes < 1024) return `${bytes} B`;
    if (bytes < 1024 * 1024) return `${(bytes / 1024).toFixed(0)} KB`;
    return `${(bytes / (1024 * 1024)).toFixed(1)} MB`;
  };

  const isPreviewable = (fileName: string | null) => {
    if (!fileName) return false;
    const ext = fileName.split('.').pop()?.toLowerCase();
    return ['jpg', 'jpeg', 'png', 'webp', 'gif', 'pdf'].includes(ext || '');
  };

  const getTypeBadgeColor = (type: string) => {
    switch (type) {
      case 'Ordem de Serviço': return 'bg-amber-100 text-amber-800 dark:bg-amber-900/50 dark:text-amber-200';
      case 'Checklist': return 'bg-blue-100 text-blue-800 dark:bg-blue-900/50 dark:text-blue-200';
      case 'Laudo Técnico': return 'bg-purple-100 text-purple-800 dark:bg-purple-900/50 dark:text-purple-200';
      case 'Nota Fiscal': return 'bg-green-100 text-green-800 dark:bg-green-900/50 dark:text-green-200';
      case 'Foto': return 'bg-pink-100 text-pink-800 dark:bg-pink-900/50 dark:text-pink-200';
      default: return 'bg-secondary text-secondary-foreground';
    }
  };

  return (
    <div className="flex flex-col h-full">
      {/* Header */}
      <div className="flex items-center justify-between p-3 border-b">
        <div className="flex items-center gap-2">
          <FileText className="h-5 w-5 text-primary" />
          <span className="font-semibold text-sm">Documentos Históricos</span>
          <Badge variant="secondary" className="text-xs">{documents.length}</Badge>
        </div>
        <Button size="sm" onClick={() => setShowUpload(true)} className="gap-1.5">
          <Plus className="h-4 w-4" />
          Anexar
        </Button>
      </div>

      {/* List */}
      <ScrollArea className="flex-1">
        {loading ? (
          <div className="flex items-center justify-center py-12">
            <Loader2 className="h-6 w-6 animate-spin text-muted-foreground" />
          </div>
        ) : documents.length === 0 ? (
          <div className="flex flex-col items-center justify-center py-12 text-muted-foreground">
            <FileText className="h-12 w-12 mb-3 opacity-30" />
            <p className="text-sm font-medium">Nenhum documento anexado</p>
            <p className="text-xs mt-1">Clique em "Anexar" para adicionar documentos históricos</p>
          </div>
        ) : (
          <div className="divide-y">
            {documents.map(doc => (
              <div key={doc.id} className="p-3 hover:bg-accent/50 transition-colors">
                <div className="flex items-start gap-3">
                  <div className="mt-0.5 shrink-0">
                    {getFileIcon(doc.file_name)}
                  </div>
                  <div className="flex-1 min-w-0">
                    <div className="flex items-center gap-2 flex-wrap">
                      <span className="font-medium text-sm truncate">{doc.title}</span>
                      <Badge className={cn("text-[10px] px-1.5 py-0", getTypeBadgeColor(doc.document_type))}>
                        {doc.document_type}
                      </Badge>
                    </div>
                    {doc.description && (
                      <p className="text-xs text-muted-foreground mt-0.5 line-clamp-2">{doc.description}</p>
                    )}
                    <div className="flex items-center gap-3 mt-1 text-xs text-muted-foreground">
                      {doc.document_date && (
                        <span className="flex items-center gap-1">
                          <Calendar className="h-3 w-3" />
                          {format(new Date(doc.document_date + 'T12:00:00'), 'dd/MM/yyyy')}
                        </span>
                      )}
                      {doc.file_size && <span>{formatSize(doc.file_size)}</span>}
                      <span>{format(new Date(doc.created_at), 'dd/MM/yy HH:mm')}</span>
                    </div>
                  </div>
                  <div className="flex items-center gap-1 shrink-0">
                    {isPreviewable(doc.file_name) && (
                      <Button variant="ghost" size="icon" className="h-7 w-7" onClick={() => setPreviewUrl(doc.file_url)}>
                        <Eye className="h-3.5 w-3.5" />
                      </Button>
                    )}
                    <Button variant="ghost" size="icon" className="h-7 w-7" asChild>
                      <a href={doc.file_url} target="_blank" rel="noopener noreferrer" download>
                        <Download className="h-3.5 w-3.5" />
                      </a>
                    </Button>
                    <Button variant="ghost" size="icon" className="h-7 w-7 text-destructive hover:text-destructive" onClick={() => setDeleteId(doc.id)}>
                      <Trash2 className="h-3.5 w-3.5" />
                    </Button>
                  </div>
                </div>
              </div>
            ))}
          </div>
        )}
      </ScrollArea>

      {/* Upload Dialog */}
      <Dialog open={showUpload} onOpenChange={setShowUpload}>
        <DialogContent className="max-w-md">
          <DialogHeader>
            <DialogTitle className="flex items-center gap-2">
              <Upload className="h-5 w-5" />
              Anexar Documento
            </DialogTitle>
          </DialogHeader>
          <div className="space-y-4">
            <div className="space-y-2">
              <Label>Título *</Label>
              <Input value={title} onChange={e => setTitle(e.target.value)} placeholder="Ex: OS Troca de Pneu" />
            </div>

            <div className="grid grid-cols-2 gap-3">
              <div className="space-y-2">
                <Label>Tipo</Label>
                <Select value={docType} onValueChange={setDocType}>
                  <SelectTrigger><SelectValue /></SelectTrigger>
                  <SelectContent>
                    {DOCUMENT_TYPES.map(t => (
                      <SelectItem key={t} value={t}>{t}</SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              </div>
              <div className="space-y-2">
                <Label>Data do Documento</Label>
                <Input type="date" value={documentDate} onChange={e => setDocumentDate(e.target.value)} />
              </div>
            </div>

            <div className="space-y-2">
              <Label>Descrição</Label>
              <Textarea value={description} onChange={e => setDescription(e.target.value)} placeholder="Detalhes opcionais..." rows={2} />
            </div>

            <div className="space-y-2">
              <Label>Arquivo *</Label>
              <Input
                ref={fileInputRef}
                type="file"
                accept=".pdf,.jpg,.jpeg,.png,.webp,.doc,.docx,.xls,.xlsx,.csv,.txt"
                onChange={e => setSelectedFile(e.target.files?.[0] || null)}
              />
              {selectedFile && (
                <p className="text-xs text-muted-foreground">
                  {selectedFile.name} — {formatSize(selectedFile.size)}
                </p>
              )}
            </div>

            <div className="flex justify-end gap-2 pt-2">
              <Button variant="outline" onClick={() => { setShowUpload(false); resetForm(); }} disabled={uploading}>
                Cancelar
              </Button>
              <Button onClick={handleUpload} disabled={uploading}>
                {uploading ? <><Loader2 className="h-4 w-4 animate-spin mr-2" />Enviando...</> : <><Upload className="h-4 w-4 mr-2" />Enviar</>}
              </Button>
            </div>
          </div>
        </DialogContent>
      </Dialog>

      {/* Preview Dialog */}
      <Dialog open={!!previewUrl} onOpenChange={() => setPreviewUrl(null)}>
        <DialogContent className="max-w-4xl max-h-[90vh]">
          <DialogHeader>
            <DialogTitle>Visualizar Documento</DialogTitle>
          </DialogHeader>
          {previewUrl && (
            previewUrl.match(/\.(jpg|jpeg|png|webp|gif)/i)
              ? <img src={previewUrl} alt="Documento" className="max-w-full max-h-[70vh] object-contain mx-auto rounded" />
              : <iframe src={previewUrl} className="w-full h-[70vh] rounded border" />
          )}
        </DialogContent>
      </Dialog>

      {/* Delete Confirmation */}
      <AlertDialog open={!!deleteId} onOpenChange={() => setDeleteId(null)}>
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>Remover documento?</AlertDialogTitle>
            <AlertDialogDescription>
              Esta ação não pode ser desfeita. O arquivo será removido permanentemente.
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel>Cancelar</AlertDialogCancel>
            <AlertDialogAction onClick={handleDelete} className="bg-destructive text-destructive-foreground hover:bg-destructive/90">
              Remover
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
    </div>
  );
}
