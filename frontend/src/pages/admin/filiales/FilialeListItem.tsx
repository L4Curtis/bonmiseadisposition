import { Card, CardContent } from '@/components/ui/card';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { Pencil, Trash2 } from 'lucide-react';
import type { Filiale } from '@/types';
import { FilialeForm } from './FilialeForm';
import { FileUploadButton } from './FileUploadButton';

interface FilialeListItemProps {
  filiale: Filiale;
  isEditing: boolean;
  isAdmin: boolean;
  onSave: (data: Partial<Filiale>) => Promise<boolean>;
  onCancelEdit: () => void;
  onStartEdit: () => void;
  onDelete: () => void;
  onUpload: (type: 'logo' | 'stamp', file: File) => Promise<void>;
}

/** Une ligne de la liste des filiales : mode affichage, ou formulaire d'édition inline. */
export function FilialeListItem({
  filiale,
  isEditing,
  isAdmin,
  onSave,
  onCancelEdit,
  onStartEdit,
  onDelete,
  onUpload,
}: FilialeListItemProps) {
  return (
    <Card>
      <CardContent className="p-4">
        {isEditing ? (
          <FilialeForm filiale={filiale} onSave={onSave} onCancel={onCancelEdit} />
        ) : (
          <div className="flex items-center justify-between gap-4">
            <div className="flex items-center gap-4">
              <div className="flex items-center gap-2 text-xs">
                {filiale.logoPath ? <Badge variant="outline">Logo</Badge> : <span className="text-muted-foreground/70">—</span>}
                {filiale.stampPath ? <Badge variant="outline">Cachet</Badge> : <span className="text-muted-foreground/70">—</span>}
              </div>
              <div>
                <p className="font-medium text-foreground">{filiale.displayName}</p>
                <p className="text-xs text-muted-foreground">AD: {filiale.name}</p>
                <p className="text-xs text-muted-foreground">{filiale.address || '—'}</p>
                <p className="text-xs text-muted-foreground">SIRET: {filiale.siret || '—'}</p>
              </div>
              <Badge variant={filiale.active ? 'success' : 'error'}>
                {filiale.active ? 'Active' : 'Désactivée'}
              </Badge>
            </div>
            <div className="flex items-center gap-2">
              <FileUploadButton label="Logo" onUpload={(file) => onUpload('logo', file)} />
              <FileUploadButton label="Cachet de la filiale" onUpload={(file) => onUpload('stamp', file)} />
              <Button
                variant="outline"
                size="sm"
                onClick={onStartEdit}
                aria-label={`Modifier la filiale ${filiale.displayName}`}
              >
                <Pencil className="h-3 w-3" />
              </Button>
              {isAdmin && (
                <Button
                  variant="outline"
                  size="sm"
                  onClick={onDelete}
                  aria-label={`Supprimer la filiale ${filiale.displayName}`}
                >
                  <Trash2 className="h-3 w-3 text-destructive" />
                </Button>
              )}
            </div>
          </div>
        )}
      </CardContent>
    </Card>
  );
}
