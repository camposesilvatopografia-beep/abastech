import { useState, useEffect } from 'react';
import {
  Check,
  X,
  Trash2,
  Edit2,
  Clock,
  User,
  Truck,
  Fuel,
  Loader2,
  Search,
  Calendar,
  Filter,
  FileText,
  CheckCircle,
  XCircle,
  AlertCircle,
} from 'lucide-react';
import { Button } from '@/components/ui/button';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Badge } from '@/components/ui/badge';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '@/components/ui/select';
import { supabase } from '@/integrations/supabase/client';
import { format, startOfMonth, endOfMonth, parseISO } from 'date-fns';
import { ptBR } from 'date-fns/locale';
import { Calendar as CalendarComponent } from '@/components/ui/calendar';
import {
  Popover,
  PopoverContent,
  PopoverTrigger,
} from '@/components/ui/popover';
import { cn } from '@/lib/utils';

interface HistoryRequest {
  id: string;
  record_id: string;
  request_type: string;
  requested_by: string;
  requested_at: string;
  status: string;
  reviewed_by: string | null;
  reviewed_at: string | null;
  review_notes: string | null;
  request_reason: string | null;
  requester_name?: string;
  reviewer_name?: string;
  record_details?: {
    vehicle_code: string;
    fuel_quantity: number;
    record_date: string;
    record_time: string;
    location: string;
  };
}

interface FieldUser {
  id: string;
  name: string;
}

export function RequestHistoryPage() {
  const [requests, setRequests] = useState<HistoryRequest[]>([]);
  const [filteredRequests, setFilteredRequests] = useState<HistoryRequest[]>([]);
  const [isLoading, setIsLoading] = useState(true);
  const [users, setUsers] = useState<FieldUser[]>([]);
  
  // Filters
  const [statusFilter, setStatusFilter] = useState<string>('all');
  const [typeFilter, setTypeFilter] = useState<string>('all');
  const [userFilter, setUserFilter] = useState<string>('all');
  const [startDate, setStartDate] = useState<Date | undefined>(startOfMonth(new Date()));
  const [endDate, setEndDate] = useState<Date | undefined>(endOfMonth(new Date()));
  const [searchTerm, setSearchTerm] = useState('');

  useEffect(() => {
    fetchRequests();
    fetchUsers();
  }, []);

  useEffect(() => {
    applyFilters();
  }, [requests, statusFilter, typeFilter, userFilter, startDate, endDate, searchTerm]);

  const fetchUsers = async () => {
    const { data } = await supabase
      .from('field_users')
      .select('id, name')
      .order('name');
    
    if (data) {
      setUsers(data);
    }
  };

  const fetchRequests = async () => {
    setIsLoading(true);
    try {
      // Fetch all non-pending requests
      const { data: requestsData, error: requestsError } = await supabase
        .from('field_record_requests')
        .select('*')
        .neq('status', 'pending')
        .order('reviewed_at', { ascending: false });

      if (requestsError) throw requestsError;

      if (!requestsData || requestsData.length === 0) {
        setRequests([]);
        setIsLoading(false);
        return;
      }

      // Enrich with user names and record details
      const enrichedRequests = await Promise.all(
        requestsData.map(async (request) => {
          // Get requester name
          const { data: requesterData } = await supabase
            .from('field_users')
            .select('name')
            .eq('id', request.requested_by)
            .maybeSingle();

          // Get reviewer name if exists
          let reviewerName = null;
          if (request.reviewed_by) {
            const { data: reviewerData } = await supabase
              .from('field_users')
              .select('name')
              .eq('id', request.reviewed_by)
              .maybeSingle();
            reviewerName = reviewerData?.name || 'Desconhecido';
          }

          // Get record details - may be deleted
          const { data: recordData } = await supabase
            .from('field_fuel_records')
            .select('vehicle_code, fuel_quantity, record_date, record_time, location')
            .eq('id', request.record_id)
            .maybeSingle();

          return {
            ...request,
            requester_name: requesterData?.name || 'Desconhecido',
            reviewer_name: reviewerName,
            record_details: recordData || undefined,
          };
        })
      );

      setRequests(enrichedRequests);
    } catch (err) {
      console.error('Error fetching history:', err);
    } finally {
      setIsLoading(false);
    }
  };

  const applyFilters = () => {
    let filtered = [...requests];

    // Status filter
    if (statusFilter !== 'all') {
      filtered = filtered.filter(r => r.status === statusFilter);
    }

    // Type filter
    if (typeFilter !== 'all') {
      filtered = filtered.filter(r => r.request_type === typeFilter);
    }

    // User filter
    if (userFilter !== 'all') {
      filtered = filtered.filter(r => r.requested_by === userFilter);
    }

    // Date filter
    if (startDate) {
      filtered = filtered.filter(r => {
        const requestDate = new Date(r.requested_at);
        return requestDate >= startDate;
      });
    }

    if (endDate) {
      const endOfDay = new Date(endDate);
      endOfDay.setHours(23, 59, 59, 999);
      filtered = filtered.filter(r => {
        const requestDate = new Date(r.requested_at);
        return requestDate <= endOfDay;
      });
    }

    // Search term (vehicle code or requester name)
    if (searchTerm.trim()) {
      const term = searchTerm.toLowerCase();
      filtered = filtered.filter(r => 
        r.record_details?.vehicle_code?.toLowerCase().includes(term) ||
        r.requester_name?.toLowerCase().includes(term)
      );
    }

    setFilteredRequests(filtered);
  };

  const formatDate = (dateStr: string) => {
    try {
      return format(new Date(dateStr), "dd/MM/yyyy 'às' HH:mm", { locale: ptBR });
    } catch {
      return dateStr;
    }
  };

  const clearFilters = () => {
    setStatusFilter('all');
    setTypeFilter('all');
    setUserFilter('all');
    setStartDate(startOfMonth(new Date()));
    setEndDate(endOfMonth(new Date()));
    setSearchTerm('');
  };

  // Stats
  const stats = {
    total: filteredRequests.length,
    approved: filteredRequests.filter(r => r.status === 'approved').length,
    rejected: filteredRequests.filter(r => r.status === 'rejected').length,
    deletions: filteredRequests.filter(r => r.request_type === 'delete').length,
    edits: filteredRequests.filter(r => r.request_type === 'edit').length,
  };

  if (isLoading) {
    return (
      <div className="flex items-center justify-center h-64">
        <Loader2 className="w-8 h-8 animate-spin text-primary" />
      </div>
    );
  }

  return (
    <div className="space-y-6">
      {/* Header */}
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-2xl font-bold">Histórico de Solicitações</h1>
          <p className="text-muted-foreground">
            Auditoria de todas as solicitações processadas
          </p>
        </div>
        <Badge variant="outline" className="text-lg px-4 py-2">
          <FileText className="w-4 h-4 mr-2" />
          {filteredRequests.length} registros
        </Badge>
      </div>

      {/* Stats Cards */}
      <div className="grid grid-cols-2 md:grid-cols-4 gap-4">
        <Card>
          <CardContent className="p-4 text-center">
            <div className="text-2xl font-bold text-primary">{stats.total}</div>
            <div className="text-sm text-muted-foreground">Total</div>
          </CardContent>
        </Card>
        <Card className="border-l-4 border-l-green-500">
          <CardContent className="p-4 text-center">
            <div className="text-2xl font-bold text-green-600">{stats.approved}</div>
            <div className="text-sm text-muted-foreground">Aprovadas</div>
          </CardContent>
        </Card>
        <Card className="border-l-4 border-l-red-500">
          <CardContent className="p-4 text-center">
            <div className="text-2xl font-bold text-red-600">{stats.rejected}</div>
            <div className="text-sm text-muted-foreground">Rejeitadas</div>
          </CardContent>
        </Card>
        <Card className="border-l-4 border-l-amber-500">
          <CardContent className="p-4 text-center">
            <div className="text-2xl font-bold text-amber-600">{stats.deletions}</div>
            <div className="text-sm text-muted-foreground">Exclusões</div>
          </CardContent>
        </Card>
      </div>

      {/* Filters */}
      <Card>
        <CardHeader className="pb-3">
          <CardTitle className="text-lg flex items-center gap-2">
            <Filter className="w-4 h-4" />
            Filtros
          </CardTitle>
        </CardHeader>
        <CardContent>
          <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-5 gap-4">
            {/* Search */}
            <div className="space-y-2">
              <Label>Buscar</Label>
              <div className="relative">
                <Search className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-muted-foreground" />
                <Input
                  placeholder="Veículo ou usuário..."
                  value={searchTerm}
                  onChange={(e) => setSearchTerm(e.target.value)}
                  className="pl-9"
                />
              </div>
            </div>

            {/* Status */}
            <div className="space-y-2">
              <Label>Status</Label>
              <Select value={statusFilter} onValueChange={setStatusFilter}>
                <SelectTrigger>
                  <SelectValue placeholder="Todos" />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="all">Todos</SelectItem>
                  <SelectItem value="approved">Aprovadas</SelectItem>
                  <SelectItem value="rejected">Rejeitadas</SelectItem>
                </SelectContent>
              </Select>
            </div>

            {/* Type */}
            <div className="space-y-2">
              <Label>Tipo</Label>
              <Select value={typeFilter} onValueChange={setTypeFilter}>
                <SelectTrigger>
                  <SelectValue placeholder="Todos" />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="all">Todos</SelectItem>
                  <SelectItem value="delete">Exclusão</SelectItem>
                  <SelectItem value="edit">Edição</SelectItem>
                </SelectContent>
              </Select>
            </div>

            {/* User */}
            <div className="space-y-2">
              <Label>Solicitante</Label>
              <Select value={userFilter} onValueChange={setUserFilter}>
                <SelectTrigger>
                  <SelectValue placeholder="Todos" />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="all">Todos</SelectItem>
                  {users.map(user => (
                    <SelectItem key={user.id} value={user.id}>
                      {user.name}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>

            {/* Date Range */}
            <div className="space-y-2">
              <Label>Período</Label>
              <div className="flex gap-2">
                <Popover>
                  <PopoverTrigger asChild>
                    <Button variant="outline" className="w-full justify-start text-left font-normal">
                      <Calendar className="mr-2 h-4 w-4" />
                      {startDate ? format(startDate, 'dd/MM', { locale: ptBR }) : 'Início'}
                    </Button>
                  </PopoverTrigger>
                  <PopoverContent className="w-auto p-0" align="start">
                    <CalendarComponent
                      mode="single"
                      selected={startDate}
                      onSelect={setStartDate}
                      initialFocus
                    />
                  </PopoverContent>
                </Popover>
                <Popover>
                  <PopoverTrigger asChild>
                    <Button variant="outline" className="w-full justify-start text-left font-normal">
                      <Calendar className="mr-2 h-4 w-4" />
                      {endDate ? format(endDate, 'dd/MM', { locale: ptBR }) : 'Fim'}
                    </Button>
                  </PopoverTrigger>
                  <PopoverContent className="w-auto p-0" align="start">
                    <CalendarComponent
                      mode="single"
                      selected={endDate}
                      onSelect={setEndDate}
                      initialFocus
                    />
                  </PopoverContent>
                </Popover>
              </div>
            </div>
          </div>

          <div className="flex justify-end mt-4">
            <Button variant="outline" size="sm" onClick={clearFilters}>
              Limpar Filtros
            </Button>
          </div>
        </CardContent>
      </Card>

      {/* History List */}
      {filteredRequests.length === 0 ? (
        <Card>
          <CardContent className="flex flex-col items-center justify-center py-12">
            <FileText className="w-16 h-16 text-muted-foreground mb-4" />
            <h3 className="text-lg font-semibold mb-2">Nenhum registro encontrado</h3>
            <p className="text-muted-foreground text-center">
              Não há solicitações processadas que correspondam aos filtros selecionados.
            </p>
          </CardContent>
        </Card>
      ) : (
        <div className="space-y-4">
          {filteredRequests.map((request) => (
            <Card 
              key={request.id} 
              className={cn(
                "border-l-4",
                request.status === 'approved' ? "border-l-green-500" : "border-l-red-500"
              )}
            >
              <CardContent className="p-4">
                <div className="flex items-start gap-4">
                  {/* Status Icon */}
                  <div className={cn(
                    "p-3 rounded-full shrink-0",
                    request.status === 'approved' 
                      ? 'bg-green-100 text-green-600 dark:bg-green-900/30 dark:text-green-400' 
                      : 'bg-red-100 text-red-600 dark:bg-red-900/30 dark:text-red-400'
                  )}>
                    {request.status === 'approved' ? (
                      <CheckCircle className="w-5 h-5" />
                    ) : (
                      <XCircle className="w-5 h-5" />
                    )}
                  </div>

                  {/* Main Content */}
                  <div className="flex-1 min-w-0">
                    {/* Header */}
                    <div className="flex flex-wrap items-center gap-2 mb-2">
                      <Badge variant={request.status === 'approved' ? 'default' : 'destructive'}>
                        {request.status === 'approved' ? 'Aprovada' : 'Rejeitada'}
                      </Badge>
                      <Badge variant="outline" className={cn(
                        request.request_type === 'delete' 
                          ? 'border-red-300 text-red-600' 
                          : 'border-blue-300 text-blue-600'
                      )}>
                        {request.request_type === 'delete' ? (
                          <>
                            <Trash2 className="w-3 h-3 mr-1" />
                            Exclusão
                          </>
                        ) : (
                          <>
                            <Edit2 className="w-3 h-3 mr-1" />
                            Edição
                          </>
                        )}
                      </Badge>
                    </div>

                    {/* Request Info */}
                    <div className="grid grid-cols-1 md:grid-cols-2 gap-4 mb-3">
                      <div>
                        <div className="flex items-center gap-2 text-sm mb-1">
                          <User className="w-4 h-4 text-muted-foreground" />
                          <span className="font-medium">Solicitante:</span>
                          <span>{request.requester_name}</span>
                        </div>
                        <div className="flex items-center gap-2 text-sm text-muted-foreground">
                          <Clock className="w-4 h-4" />
                          {formatDate(request.requested_at)}
                        </div>
                      </div>
                      <div>
                        <div className="flex items-center gap-2 text-sm mb-1">
                          <User className="w-4 h-4 text-muted-foreground" />
                          <span className="font-medium">Revisado por:</span>
                          <span>{request.reviewer_name || '-'}</span>
                        </div>
                        {request.reviewed_at && (
                          <div className="flex items-center gap-2 text-sm text-muted-foreground">
                            <Clock className="w-4 h-4" />
                            {formatDate(request.reviewed_at)}
                          </div>
                        )}
                      </div>
                    </div>

                    {/* Record Details */}
                    {request.record_details ? (
                      <div className="bg-muted/50 rounded-lg p-3 space-y-1 mb-3">
                        <div className="flex items-center gap-2 text-sm">
                          <Truck className="w-4 h-4 text-muted-foreground" />
                          <span className="font-medium">{request.record_details.vehicle_code}</span>
                        </div>
                        <div className="flex items-center gap-2 text-sm">
                          <Fuel className="w-4 h-4 text-muted-foreground" />
                          <span>{request.record_details.fuel_quantity}L</span>
                          <span className="text-muted-foreground">•</span>
                          <span>{request.record_details.location}</span>
                        </div>
                        <div className="text-xs text-muted-foreground">
                          Registro de {request.record_details.record_date} às {request.record_details.record_time}
                        </div>
                      </div>
                    ) : (
                      <div className="bg-muted/50 rounded-lg p-3 mb-3 text-sm text-muted-foreground italic">
                        Registro excluído do sistema
                      </div>
                    )}

                    {/* Request Reason */}
                    {request.request_reason && (
                      <div className="bg-amber-50 dark:bg-amber-900/20 border border-amber-200 dark:border-amber-800 rounded-lg p-3 mb-3">
                        <div className="flex items-start gap-2">
                          <AlertCircle className="w-4 h-4 text-amber-600 dark:text-amber-400 mt-0.5 shrink-0" />
                          <div>
                            <p className="text-xs font-medium text-amber-700 dark:text-amber-300 mb-1">Motivo da solicitação:</p>
                            <p className="text-sm text-amber-900 dark:text-amber-100">{request.request_reason}</p>
                          </div>
                        </div>
                      </div>
                    )}

                    {/* Review Notes */}
                    {request.review_notes && (
                      <div className="bg-blue-50 dark:bg-blue-900/20 border border-blue-200 dark:border-blue-800 rounded-lg p-3">
                        <div className="flex items-start gap-2">
                          <FileText className="w-4 h-4 text-blue-600 dark:text-blue-400 mt-0.5 shrink-0" />
                          <div>
                            <p className="text-xs font-medium text-blue-700 dark:text-blue-300 mb-1">Observação do revisor:</p>
                            <p className="text-sm text-blue-900 dark:text-blue-100">{request.review_notes}</p>
                          </div>
                        </div>
                      </div>
                    )}
                  </div>
                </div>
              </CardContent>
            </Card>
          ))}
        </div>
      )}
    </div>
  );
}
