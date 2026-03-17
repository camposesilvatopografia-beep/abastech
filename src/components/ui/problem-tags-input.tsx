import * as React from 'react';
import { useState, useEffect, useRef } from 'react';
import { X, Plus, Tag } from 'lucide-react';
import { Badge } from '@/components/ui/badge';
import { Input } from '@/components/ui/input';
import { Button } from '@/components/ui/button';
import { cn } from '@/lib/utils';
import { supabase } from '@/integrations/supabase/client';

interface ProblemTagsInputProps {
  value: string[];
  onChange: (tags: string[]) => void;
  className?: string;
  placeholder?: string;
}

export function ProblemTagsInput({ value, onChange, className, placeholder = 'Ex: Pneu, Ar condicionado...' }: ProblemTagsInputProps) {
  const [inputValue, setInputValue] = useState('');
  const [suggestions, setSuggestions] = useState<string[]>([]);
  const [showSuggestions, setShowSuggestions] = useState(false);
  const [allTags, setAllTags] = useState<string[]>([]);
  const inputRef = useRef<HTMLInputElement>(null);
  const wrapperRef = useRef<HTMLDivElement>(null);

  // Fetch existing tags from DB for autocomplete
  useEffect(() => {
    const fetchTags = async () => {
      const { data } = await supabase
        .from('service_orders')
        .select('problem_tags')
        .not('problem_tags', 'is', null);
      if (data) {
        const tagSet = new Set<string>();
        data.forEach((row: any) => {
          if (Array.isArray(row.problem_tags)) {
            row.problem_tags.forEach((t: string) => tagSet.add(t));
          }
        });
        setAllTags(Array.from(tagSet).sort());
      }
    };
    fetchTags();
  }, []);

  // Filter suggestions based on input
  useEffect(() => {
    if (inputValue.trim().length > 0) {
      const filtered = allTags.filter(
        t => t.toLowerCase().includes(inputValue.toLowerCase()) && !value.includes(t)
      );
      setSuggestions(filtered);
      setShowSuggestions(filtered.length > 0);
    } else {
      // Show all unused tags when focused
      const unused = allTags.filter(t => !value.includes(t));
      setSuggestions(unused.slice(0, 10));
    }
  }, [inputValue, allTags, value]);

  // Close suggestions on click outside
  useEffect(() => {
    const handler = (e: MouseEvent) => {
      if (wrapperRef.current && !wrapperRef.current.contains(e.target as Node)) {
        setShowSuggestions(false);
      }
    };
    document.addEventListener('mousedown', handler);
    return () => document.removeEventListener('mousedown', handler);
  }, []);

  const addTag = (tag: string) => {
    const trimmed = tag.trim();
    if (trimmed && !value.includes(trimmed)) {
      onChange([...value, trimmed]);
      // Add to allTags if new
      if (!allTags.includes(trimmed)) {
        setAllTags(prev => [...prev, trimmed].sort());
      }
    }
    setInputValue('');
    setShowSuggestions(false);
    inputRef.current?.focus();
  };

  const removeTag = (tag: string) => {
    onChange(value.filter(t => t !== tag));
  };

  const handleKeyDown = (e: React.KeyboardEvent) => {
    if (e.key === 'Enter' || e.key === ',') {
      e.preventDefault();
      if (inputValue.trim()) addTag(inputValue);
    } else if (e.key === 'Backspace' && !inputValue && value.length > 0) {
      removeTag(value[value.length - 1]);
    }
  };

  return (
    <div ref={wrapperRef} className={cn("space-y-2", className)}>
      <div className="flex flex-wrap gap-1.5 min-h-[36px] p-2 rounded-md border border-input bg-background">
        {value.map(tag => (
          <Badge key={tag} variant="secondary" className="gap-1 text-xs px-2 py-1 bg-amber-100 text-amber-800 dark:bg-amber-900/50 dark:text-amber-200 border border-amber-300 dark:border-amber-700">
            <Tag className="h-3 w-3" />
            {tag}
            <button type="button" onClick={() => removeTag(tag)} className="ml-0.5 hover:text-destructive">
              <X className="h-3 w-3" />
            </button>
          </Badge>
        ))}
        <div className="relative flex-1 min-w-[120px]">
          <Input
            ref={inputRef}
            value={inputValue}
            onChange={e => {
              setInputValue(e.target.value);
              setShowSuggestions(true);
            }}
            onFocus={() => setShowSuggestions(true)}
            onKeyDown={handleKeyDown}
            placeholder={value.length === 0 ? placeholder : 'Adicionar...'}
            className="border-0 shadow-none h-7 p-0 text-sm focus-visible:ring-0 focus-visible:ring-offset-0"
          />
        </div>
      </div>

      {showSuggestions && suggestions.length > 0 && (
        <div className="rounded-md border border-border bg-popover shadow-md p-1 max-h-32 overflow-y-auto">
          {suggestions.map(s => (
            <button
              key={s}
              type="button"
              onClick={() => addTag(s)}
              className="w-full text-left text-xs px-2 py-1.5 rounded hover:bg-accent hover:text-accent-foreground flex items-center gap-2"
            >
              <Plus className="h-3 w-3 text-muted-foreground" />
              {s}
            </button>
          ))}
        </div>
      )}

      {inputValue.trim() && !allTags.includes(inputValue.trim()) && !value.includes(inputValue.trim()) && (
        <Button
          type="button"
          variant="ghost"
          size="sm"
          className="h-7 text-xs gap-1"
          onClick={() => addTag(inputValue)}
        >
          <Plus className="h-3 w-3" />
          Criar "{inputValue.trim()}"
        </Button>
      )}
    </div>
  );
}
