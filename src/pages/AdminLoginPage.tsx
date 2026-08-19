import React, { useMemo, useState } from 'react';
import { useNavigate, useSearchParams } from 'react-router-dom';
import { motion } from 'framer-motion';
import {
  LockKeyhole,
  ShieldCheck,
  Terminal,
  AlertTriangle,
  Loader2
} from 'lucide-react';
import { toast } from 'sonner';

import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import {
  Card,
  CardContent,
  CardDescription,
  CardHeader,
  CardTitle
} from '@/components/ui/card';
import { Toaster } from '@/components/ui/sonner';
import { ThemeToggle } from '@/components/ThemeToggle';
import { setAdminToken, validateAdminToken } from '@/lib/admin-auth';

export function AdminLoginPage() {
  const [token, setToken] = useState('');
  const [submitting, setSubmitting] = useState(false);

  const navigate = useNavigate();
  const [searchParams] = useSearchParams();

  const nextPath = useMemo(() => {
    const next = searchParams.get('next');

    if (!next) return '/';

    try {
      const decoded = decodeURIComponent(next);
      return decoded.startsWith('/') ? decoded : '/';
    } catch {
      return '/';
    }
  }, [searchParams]);

  async function handleSubmit(event: React.FormEvent<HTMLFormElement>) {
    event.preventDefault();

    const cleanToken = token.trim();

    if (!cleanToken) {
      toast.error('ADMIN TOKEN REQUIRED');
      return;
    }

    setSubmitting(true);

    try {
      const valid = await validateAdminToken(cleanToken);

      if (!valid) {
        toast.error('AUTHENTICATION FAILED', {
          description: 'The token was rejected by /api/system/stats.'
        });
        return;
      }

      setAdminToken(cleanToken);

      toast.success('ADMIN SESSION VERIFIED', {
        description: 'Private dashboard access unlocked.'
      });

      navigate(nextPath, { replace: true });
    } catch (error) {
      toast.error('AUTHENTICATION ERROR', {
        description:
          error instanceof Error
            ? error.message
            : 'Could not validate the admin token.'
      });
    } finally {
      setSubmitting(false);
    }
  }

  return (
    <div className="min-h-screen bg-slate-950 text-slate-100 flex items-center justify-center p-4 relative overflow-hidden">
      <Toaster position="top-center" />

      <div className="fixed top-4 right-4 z-50">
        <ThemeToggle />
      </div>

      <div className="absolute inset-0 bg-[radial-gradient(circle_at_center,rgba(56,189,248,0.12),transparent_35%)]" />
      <div className="absolute inset-0 bg-[linear-gradient(to_bottom,rgba(2,6,23,0),rgba(2,6,23,0.92))]" />

      <motion.div
        initial={{ opacity: 0, y: 18, scale: 0.98 }}
        animate={{ opacity: 1, y: 0, scale: 1 }}
        transition={{ duration: 0.35 }}
        className="w-full max-w-md relative z-10"
      >
        <div className="mb-8 text-center space-y-3">
          <div className="mx-auto h-14 w-14 rounded-2xl bg-sky-500/10 border border-sky-500/20 flex items-center justify-center shadow-2xl shadow-sky-500/10">
            <Terminal className="h-7 w-7 text-sky-400" />
          </div>

          <div>
            <h1 className="text-3xl font-black tracking-tighter uppercase">
              Nexus Admin Access
            </h1>
            <p className="text-[10px] font-mono text-slate-500 uppercase tracking-[0.25em] mt-2">
              Private Dashboard Authentication
            </p>
          </div>
        </div>

        <Card className="bg-slate-900/70 border-slate-800 shadow-2xl backdrop-blur-xl">
          <CardHeader className="text-center border-b border-slate-800/60">
            <CardTitle className="text-sm font-black uppercase tracking-[0.2em] flex items-center justify-center gap-2">
              <LockKeyhole className="h-4 w-4 text-emerald-400" />
              Admin Token Required
            </CardTitle>
            <CardDescription className="text-xs text-slate-500">
              Enter the same token configured as <code>ADMIN_API_TOKEN</code>.
            </CardDescription>
          </CardHeader>

          <CardContent className="p-6">
            <form onSubmit={handleSubmit} className="space-y-5">
              <div className="space-y-2">
                <label className="text-[10px] font-black text-slate-500 uppercase tracking-widest">
                  Admin API Token
                </label>

                <Input
                  type="password"
                  value={token}
                  onChange={(event) => setToken(event.target.value)}
                  placeholder="Paste ADMIN_API_TOKEN"
                  autoComplete="current-password"
                  className="bg-slate-950 border-slate-800 h-12 font-mono text-sm"
                />
              </div>

              <Button
                type="submit"
                disabled={submitting}
                className="w-full h-11 bg-sky-600 hover:bg-sky-500 text-white font-black uppercase tracking-widest text-[10px]"
              >
                {submitting ? (
                  <>
                    <Loader2 className="h-4 w-4 mr-2 animate-spin" />
                    Verifying
                  </>
                ) : (
                  <>
                    <ShieldCheck className="h-4 w-4 mr-2" />
                    Unlock Dashboard
                  </>
                )}
              </Button>
            </form>

            <div className="mt-5 p-4 rounded-xl bg-amber-500/10 border border-amber-500/20 flex gap-3">
              <AlertTriangle className="h-4 w-4 text-amber-400 shrink-0 mt-0.5" />
              <p className="text-[10px] text-amber-200/80 font-mono leading-relaxed">
                This token is stored only in this browser&apos;s localStorage and sent
                as a Bearer token to private API routes. Public report and payment
                pages remain accessible without admin login.
              </p>
            </div>
          </CardContent>
        </Card>
      </motion.div>
    </div>
  );
}