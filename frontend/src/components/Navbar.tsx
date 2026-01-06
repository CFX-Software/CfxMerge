import { Layers } from 'lucide-react';

export const Navbar = () => {
  return (
    <div className="fixed top-6 left-0 right-0 z-50 flex justify-center px-6">
      <nav className="w-full max-w-6xl glass rounded-full px-6 py-3.5 flex items-center justify-between shadow-2xl">
        {/* Logo */}
        <div className="flex items-center gap-2 group">
          <div className="p-1.5 bg-fivem/10 rounded-lg border border-fivem/20">
            <Layers size={18} className="text-fivem" strokeWidth={2} />
          </div>
          <span className="text-xl font-semibold text-white/95 group-hover:text-white transition-colors">
            Cfx Merge
          </span>
        </div>

        {/* Version */}
        <div className="text-[11px] font-medium text-secondary/60 uppercase tracking-wider">
          v1.0.0
        </div>
      </nav>
    </div>
  );
};
