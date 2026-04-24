import React from "react";
import { 
  LayoutDashboard, 
  Database, 
  Cpu, 
  Wallet, 
  ShieldAlert, 
  Terminal,
  ChevronRight
} from "lucide-react";
import { Link, useLocation } from "react-router-dom";
import {
  Sidebar,
  SidebarContent,
  SidebarFooter,
  SidebarGroup,
  SidebarHeader,
  SidebarGroupLabel,
  SidebarMenu,
  SidebarMenuItem,
  SidebarMenuButton,
} from "@/components/ui/sidebar";
import { cn } from "@/lib/utils";
export function AppSidebar(): JSX.Element {
  const location = useLocation();
  const menuItems = [
    { name: "Command Center", icon: LayoutDashboard, path: "/" },
    { name: "Opportunity Vault", icon: Database, path: "/vault" },
    { name: "Agent Oversight", icon: Cpu, path: "/agents" },
    { name: "Treasury Ledger", icon: Wallet, path: "/treasury" },
  ];
  return (
    <Sidebar className="border-r border-slate-800 bg-slate-950">
      <SidebarHeader className="p-4 border-b border-slate-800/50">
        <div className="flex items-center gap-3">
          <div className="h-8 w-8 rounded-lg bg-gradient-to-br from-sky-500 to-emerald-500 flex items-center justify-center shadow-lg shadow-sky-500/20">
            <Terminal className="h-5 w-5 text-white" />
          </div>
          <div>
            <span className="text-sm font-black tracking-tighter text-slate-100">NEXUS</span>
            <p className="text-[9px] font-mono text-emerald-500 leading-none">AUTONOMOUS</p>
          </div>
        </div>
      </SidebarHeader>
      <SidebarContent className="bg-slate-950">
        <SidebarGroup>
          <SidebarGroupLabel className="text-slate-600 uppercase text-[9px] tracking-[0.2em] px-4 mb-2">Navigation</SidebarGroupLabel>
          <SidebarMenu>
            {menuItems.map((item) => (
              <SidebarMenuItem key={item.path}>
                <SidebarMenuButton 
                  asChild 
                  isActive={location.pathname === item.path}
                  className={cn(
                    "hover:bg-slate-900 transition-colors py-5",
                    location.pathname === item.path ? "bg-slate-900 text-sky-400" : "text-slate-400"
                  )}
                >
                  <Link to={item.path} className="flex items-center gap-3">
                    <item.icon className="h-4 w-4" />
                    <span className="text-xs font-bold uppercase tracking-wide">{item.name}</span>
                  </Link>
                </SidebarMenuButton>
              </SidebarMenuItem>
            ))}
          </SidebarMenu>
        </SidebarGroup>
        <SidebarGroup className="mt-4">
          <SidebarGroupLabel className="text-slate-600 uppercase text-[9px] tracking-[0.2em] px-4 mb-2">Control</SidebarGroupLabel>
          <SidebarMenu>
            <SidebarMenuItem>
              <SidebarMenuButton asChild className="text-slate-400 hover:bg-slate-900">
                <Link to="/governor" className="flex items-center gap-3">
                  <ShieldAlert className="h-4 w-4 text-amber-500" />
                  <span className="text-xs font-bold uppercase tracking-wide">Governor Policy</span>
                </Link>
              </SidebarMenuButton>
            </SidebarMenuItem>
          </SidebarMenu>
        </SidebarGroup>
      </SidebarContent>
      <SidebarFooter className="p-4 border-t border-slate-800/50 bg-slate-950">
        <div className="flex items-center justify-between px-2">
          <div className="flex items-center gap-2">
            <div className="w-2 h-2 rounded-full bg-emerald-500 animate-pulse" />
            <span className="text-[10px] font-mono text-slate-500">LIVE_LINK</span>
          </div>
          <ChevronRight className="h-3 w-3 text-slate-700" />
        </div>
      </SidebarFooter>
    </Sidebar>
  );
}