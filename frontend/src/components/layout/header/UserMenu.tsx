import { useState } from 'react';
import { useAuth } from '@/contexts/AuthContext';
import { useUiView, UI_VIEW_LABELS, UI_VIEW_ICON_MAP, type UiView } from '@/contexts/UiViewContext';
import type { User } from '@/types';
import { LogOut, KeyRound } from 'lucide-react';
import { Avatar, AvatarFallback } from '@/components/ui/avatar';
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuLabel,
  DropdownMenuRadioGroup,
  DropdownMenuRadioItem,
  DropdownMenuSeparator,
  DropdownMenuTrigger,
} from '@/components/ui/dropdown-menu';
import { ChangePasswordDialog } from './ChangePasswordDialog';

function getInitials(name?: string): string {
  if (!name) return '?';
  return name
    .split(' ')
    .map((w) => w[0])
    .filter(Boolean)
    .slice(0, 2)
    .join('')
    .toUpperCase();
}

/** Avatar + menu déroulant : sélecteur de vue, changement de mot de passe, déconnexion. */
export function UserMenu() {
  const { user, logout } = useAuth();
  const { activeView, setActiveView, availableViews } = useUiView();
  const [showChangePwd, setShowChangePwd] = useState(false);
  const isLocal = !!(user as User & { isLocalAccount?: boolean })?.isLocalAccount;

  return (
    <>
      <DropdownMenu>
        <DropdownMenuTrigger asChild>
          <button
            aria-label="Menu utilisateur"
            className="flex items-center gap-2 rounded-lg px-2 py-1.5 text-sm text-muted-foreground hover:bg-accent hover:text-foreground transition-colors focus:outline-none focus:ring-2 focus:ring-ring focus:ring-offset-1"
          >
            <Avatar className="h-6 w-6">
              <AvatarFallback className="bg-primary/10 text-primary text-[10px] font-semibold">
                {getInitials(user?.displayName)}
              </AvatarFallback>
            </Avatar>
            <span className="hidden sm:inline font-medium text-xs">{user?.displayName}</span>
            {availableViews.length > 1 && (
              <span className="hidden sm:inline rounded-full bg-[hsl(var(--primary)/0.10)] dark:bg-[hsl(var(--primary)/0.15)] px-1.5 py-0.5 text-[10px] text-[hsl(var(--primary))] font-medium">
                {UI_VIEW_LABELS[activeView]}
              </span>
            )}
            {isLocal && (
              <span className="rounded-full bg-muted px-1.5 py-0.5 text-[10px] text-muted-foreground">local</span>
            )}
          </button>
        </DropdownMenuTrigger>
        <DropdownMenuContent align="end" className="w-56">
          <DropdownMenuLabel className="font-normal">
            <div className="flex flex-col space-y-1">
              <p className="text-sm font-medium">{user?.displayName}</p>
              <p className="text-xs text-muted-foreground">{user?.email}</p>
            </div>
          </DropdownMenuLabel>

          {availableViews.length > 1 && (
            <>
              <DropdownMenuSeparator />
              <p className="px-2 py-1.5 text-xs font-semibold text-muted-foreground">Vue active</p>
              <DropdownMenuRadioGroup
                value={activeView}
                onValueChange={(v) => setActiveView(v as UiView)}
              >
                {availableViews.map((view) => {
                  const Icon = UI_VIEW_ICON_MAP[view];
                  return (
                    <DropdownMenuRadioItem key={view} value={view}>
                      <span className="flex items-center gap-2">
                        <Icon className="h-4 w-4" />
                        {UI_VIEW_LABELS[view]}
                      </span>
                    </DropdownMenuRadioItem>
                  );
                })}
              </DropdownMenuRadioGroup>
            </>
          )}

          <DropdownMenuSeparator />
          {isLocal && (
            <DropdownMenuItem onClick={() => setShowChangePwd(true)}>
              <KeyRound className="mr-2 h-4 w-4" />
              Changer le mot de passe
            </DropdownMenuItem>
          )}
          <DropdownMenuItem onClick={logout} className="text-red-600 focus:text-red-600">
            <LogOut className="mr-2 h-4 w-4" />
            Déconnexion
          </DropdownMenuItem>
        </DropdownMenuContent>
      </DropdownMenu>
      <ChangePasswordDialog open={showChangePwd} onOpenChange={setShowChangePwd} />
    </>
  );
}
