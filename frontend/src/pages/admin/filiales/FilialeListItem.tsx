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
              {filiale.logoPath ? (
                <img
                  src={`/api/filiales/file/${filiale.logoPath.replace('uploads/', '')}`}
                  alt={filiale.displayName}
                  className="h-10 w-20 object-contain rounded border"
                />
              ) : (
                <div className="h-10 w-20 rounded border bg-muted flex items-center justify-center text-xs text-muted-foreground/70">
                  Pas de logo
                </div>
              )}
              <div>
                <p className="font-medium text-foreground">{filiale.displayName}</p>
                <p className="text-xs text-muted-foreground">AD: {filiale.name}</p>
                {filiale.address && <p className="text-xs text-muted-foreground">{filiale.address}</p>}
                {filiale.siret && <p className="text-xs text-muted-foreground">SIRET: {filiale.siret}</p>}
              </div>
              <Badge variant={filiale.active ? 'success' : 'outline'}>
                {filiale.active ? 'Active' : 'Inactive'}
              </Badge>
            </div>
            <div className="flex items-center gap-2">
              <FileUploadButton label="Logo" onUpload={(file) => onUpload('logo', file)} />
              <FileUploadButton label="Cachet IT" onUpload={(file) => onUpload('stamp', file)} />
              <Button variant="outline" size="sm" onClick={onStartEdit}>
                <Pencil className="h-3 w-3" />
              </Button>
              {isAdmin && (
                <Button variant="outline" size="sm" onClick={onDelete}>
                  <Trash2 className="h-3 w-3 text-red-500" />
                </Button>
              )}
            </div>
          </div>
        )}
      </CardContent>
    </Card>
  );
}
