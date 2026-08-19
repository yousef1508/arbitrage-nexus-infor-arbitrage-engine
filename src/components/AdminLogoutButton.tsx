import React from 'react';
import { LogOut } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { clearAdminToken } from '@/lib/admin-auth';

export function AdminLogoutButton() {
  function handleLogout() {
    clearAdminToken();
    window.location.href = '/admin-login';
  }

  return (
    <Button
      type="button"
      variant="outline"
      size="sm"
      onClick={handleLogout}
      className="border-slate-800 bg-slate-950/60 text-slate-400 hover:bg-red-500/10 hover:text-red-400 hover:border-red-500/30 font-bold uppercase tracking-widest text-[10px]"
    >
      <LogOut className="h-3.5 w-3.5 mr-2" />
      Logout
    </Button>
  );
}