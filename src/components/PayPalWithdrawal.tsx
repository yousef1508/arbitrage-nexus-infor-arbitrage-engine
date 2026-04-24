import React, { useState } from 'react';
import { useStore, useWithdrawable } from '@/lib/store';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogTrigger, DialogFooter } from '@/components/ui/dialog';
import { DollarSign, AlertCircle, RefreshCw, Send } from 'lucide-react';
import { toast } from 'sonner';
export function PayPalWithdrawal({ disabled = false }: { disabled?: boolean }) {
  const balance = useWithdrawable();
  const withdrawFunds = useStore(s => s.withdrawFunds);
  const [amount, setAmount] = useState<string>('');
  const [email, setEmail] = useState<string>('');
  const [isProcessing, setIsProcessing] = useState(false);
  const [isOpen, setIsOpen] = useState(false);
  const handleWithdraw = async () => {
    const numAmount = parseFloat(amount);
    if (isNaN(numAmount) || numAmount <= 0) {
      toast.error("INVALID_AMOUNT", {
        description: "Withdrawal amount must be greater than zero."
      });
      return;
    }
    if (numAmount > balance) {
      toast.error("INSUFFICIENT_FUNDS", {
        description: "Amount exceeds owner withdrawable balance."
      });
      return;
    }
    if (!email || !email.includes('@')) {
      toast.error("INVALID_EMAIL", {
        description: "A valid PayPal email address is required."
      });
      return;
    }
    setIsProcessing(true);
    try {
      if (typeof withdrawFunds !== 'function') {
        throw new Error("Withdrawal service unavailable");
      }
      const success = await withdrawFunds(numAmount, email);
      if (success) {
        toast.success("PAYOUT INITIATED", {
          description: `${numAmount.toFixed(2)} sent to ${email}. Ledger updated.`,
        });
        setIsOpen(false);
        setAmount('');
      } else {
        toast.error("WITHDRAWAL_REJECTED", {
          description: "The transaction was rejected by the Treasury Governor."
        });
      }
    } catch (e) {
      console.error("[WITHDRAWAL_EXCEPTION]", e);
      toast.error("TRANSACTION_FAILED", {
        description: "An unexpected error occurred. Please check logs."
      });
    } finally {
      setIsProcessing(false);
    }
  };
  return (
    <Dialog open={isOpen} onOpenChange={setIsOpen}>
      <DialogTrigger asChild>
        <Button 
          disabled={disabled}
          className="bg-pink-600 hover:bg-pink-700 text-white font-bold text-xs uppercase tracking-widest gap-2 h-10 shadow-lg shadow-pink-500/20 disabled:opacity-50 disabled:pointer-events-none"
        >
          <DollarSign className="h-4 w-4" />
          Withdraw Funds
        </Button>
      </DialogTrigger>
      <DialogContent className="bg-slate-950 border-slate-800 text-slate-100 sm:rounded-2xl max-w-md shadow-2xl">
        <DialogHeader>
          <DialogTitle className="text-xl font-black flex items-center gap-3">
            <DollarSign className="text-pink-500 h-6 w-6" />
            PAYPAL WITHDRAWAL
          </DialogTitle>
        </DialogHeader>
        <div className="space-y-6 py-4">
          <div className="p-4 bg-slate-900/50 border border-slate-800 rounded-xl">
            <div className="flex justify-between items-center mb-1">
              <span className="text-[10px] text-slate-500 font-bold uppercase tracking-wider">Available Balance</span>
              <span className="text-[10px] text-emerald-500 font-mono font-black">SECURE_CREDIT</span>
            </div>
            <div className="text-2xl font-mono font-black text-slate-100">
              ${(balance || 0).toLocaleString(undefined, { minimumFractionDigits: 2 })}
            </div>
          </div>
          <div className="space-y-4">
            <div className="space-y-2">
              <label className="text-xs font-bold text-slate-400 uppercase tracking-tight">PayPal Email Address</label>
              <Input
                type="email"
                placeholder="owner@example.com"
                value={email}
                onChange={(e) => setEmail(e.target.value)}
                className="bg-slate-900 border-slate-800 h-11 focus:ring-pink-500/50"
              />
            </div>
            <div className="space-y-2">
              <label className="text-xs font-bold text-slate-400 uppercase tracking-tight">Withdrawal Amount ($)</label>
              <Input
                type="number"
                placeholder="0.00"
                value={amount}
                onChange={(e) => setAmount(e.target.value)}
                className="bg-slate-900 border-slate-800 h-11 font-mono focus:ring-pink-500/50"
              />
            </div>
          </div>
          <div className="flex items-start gap-3 p-3 bg-amber-500/10 border border-amber-500/20 rounded-lg">
            <AlertCircle className="h-4 w-4 text-amber-500 shrink-0 mt-0.5" />
            <p className="text-[10px] text-amber-200/70 leading-relaxed italic">
              Withdrawals are processed manually via standard PayPal Payouts. Cooldown of 24 hours applies between requests.
            </p>
          </div>
        </div>
        <DialogFooter className="sm:justify-start">
          <Button
            onClick={handleWithdraw}
            disabled={isProcessing || !amount || !email}
            className="w-full bg-emerald-600 hover:bg-emerald-700 text-white font-bold uppercase tracking-widest h-12"
          >
            {isProcessing ? (
              <>
                <RefreshCw className="h-4 w-4 mr-2 animate-spin" />
                Processing Transaction...
              </>
            ) : (
              <>
                <Send className="h-4 w-4 mr-2" />
                Confirm Payout
              </>
            )}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}