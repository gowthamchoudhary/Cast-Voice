import { useState, useRef, useEffect } from "react";
import { useLocation } from "wouter";
import { useAuth } from "@workspace/replit-auth-web";
import { AnimatePresence, motion } from "framer-motion";

type Page = "dashboard" | "stories" | "settings" | "other";

const NAV_LINKS = [
  { label: "Dashboard", path: "/dashboard", page: "dashboard" as Page },
  { label: "Stories",   path: "/stories",   page: "stories"   as Page },
  { label: "Settings",  path: "/settings",  page: "settings"  as Page },
];

export function AppNav({ current = "other", showUser = true }: { current?: Page; showUser?: boolean }) {
  const [, setLocation] = useLocation();
  const [open, setOpen] = useState(false);
  const menuRef = useRef<HTMLDivElement>(null);
  const { user } = useAuth();

  useEffect(() => {
    function onClickOutside(e: MouseEvent) {
      if (menuRef.current && !menuRef.current.contains(e.target as Node)) {
        setOpen(false);
      }
    }
    if (open) document.addEventListener("mousedown", onClickOutside);
    return () => document.removeEventListener("mousedown", onClickOutside);
  }, [open]);

  useEffect(() => {
    setOpen(false);
  }, []);

  const navigate = (path: string) => {
    setOpen(false);
    setLocation(path);
  };

  return (
    <header className="border-b border-white/[0.06] bg-[#080808]/90 backdrop-blur-md sticky top-0 z-40">
      <div className="max-w-6xl mx-auto px-6 py-4 flex items-center justify-between">
        {/* Logo */}
        <button onClick={() => navigate("/dashboard")} className="font-serif text-xl font-bold text-[#f0e6d0]">
          Cast<span className="text-amber-400">Voice</span>
        </button>

        {/* Desktop nav */}
        <nav className="hidden sm:flex items-center gap-7 text-sm">
          {NAV_LINKS.map((link) => (
            <button
              key={link.path}
              onClick={() => navigate(link.path)}
              className={`transition-colors ${
                current === link.page
                  ? "text-[#e8dcc8] font-medium"
                  : "text-[#e8dcc8]/40 hover:text-[#e8dcc8]"
              }`}
            >
              {link.label}
            </button>
          ))}
        </nav>

        {/* Right side */}
        <div className="flex items-center gap-3">
          {/* Desktop avatar */}
          {showUser && (
            <div className="hidden sm:flex">
              {user?.profileImage ? (
                <img src={user.profileImage} alt={user.name || ""} className="w-8 h-8 rounded-full border border-white/10" />
              ) : (
                <div className="w-8 h-8 rounded-full bg-amber-400/15 border border-amber-400/20 flex items-center justify-center text-amber-400 text-sm font-bold">
                  {(user?.name || "U")[0].toUpperCase()}
                </div>
              )}
            </div>
          )}

          {/* Mobile hamburger */}
          <div ref={menuRef} className="relative sm:hidden">
            <button
              onClick={() => setOpen((v) => !v)}
              className="w-9 h-9 flex flex-col items-center justify-center gap-1.5 rounded-lg hover:bg-white/5 transition-colors"
              aria-label="Open menu"
            >
              <motion.span
                animate={open ? { rotate: 45, y: 6 } : { rotate: 0, y: 0 }}
                transition={{ duration: 0.2 }}
                className="block w-5 h-px bg-[#e8dcc8]/70 origin-center"
              />
              <motion.span
                animate={open ? { opacity: 0, scaleX: 0 } : { opacity: 1, scaleX: 1 }}
                transition={{ duration: 0.15 }}
                className="block w-5 h-px bg-[#e8dcc8]/70"
              />
              <motion.span
                animate={open ? { rotate: -45, y: -6 } : { rotate: 0, y: 0 }}
                transition={{ duration: 0.2 }}
                className="block w-5 h-px bg-[#e8dcc8]/70 origin-center"
              />
            </button>

            {/* Mobile dropdown */}
            <AnimatePresence>
              {open && (
                <motion.div
                  initial={{ opacity: 0, y: -8, scale: 0.97 }}
                  animate={{ opacity: 1, y: 0, scale: 1 }}
                  exit={{ opacity: 0, y: -8, scale: 0.97 }}
                  transition={{ duration: 0.15 }}
                  className="absolute right-0 top-12 w-52 bg-[#111]/95 border border-white/10 rounded-xl shadow-2xl backdrop-blur-md overflow-hidden"
                >
                  {/* User info at top */}
                  {showUser && user && (
                    <div className="px-4 py-3 border-b border-white/[0.06] flex items-center gap-3">
                      {user.profileImage ? (
                        <img src={user.profileImage} alt={user.name || ""} className="w-8 h-8 rounded-full border border-white/10 shrink-0" />
                      ) : (
                        <div className="w-8 h-8 rounded-full bg-amber-400/15 border border-amber-400/20 flex items-center justify-center text-amber-400 text-sm font-bold shrink-0">
                          {(user.name || "U")[0].toUpperCase()}
                        </div>
                      )}
                      <div className="min-w-0">
                        <p className="text-[#e8dcc8] text-sm font-medium truncate">{user.name || "User"}</p>
                      </div>
                    </div>
                  )}

                  {/* Nav links */}
                  <div className="py-1">
                    {NAV_LINKS.map((link) => (
                      <button
                        key={link.path}
                        onClick={() => navigate(link.path)}
                        className={`w-full flex items-center gap-3 px-4 py-3 text-sm text-left transition-colors ${
                          current === link.page
                            ? "text-amber-400 bg-amber-400/5"
                            : "text-[#e8dcc8]/70 hover:text-[#e8dcc8] hover:bg-white/5"
                        }`}
                      >
                        {link.page === "dashboard" && (
                          <svg className="w-4 h-4 shrink-0" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.5">
                            <rect x="3" y="3" width="7" height="7" rx="1" /><rect x="14" y="3" width="7" height="7" rx="1" />
                            <rect x="3" y="14" width="7" height="7" rx="1" /><rect x="14" y="14" width="7" height="7" rx="1" />
                          </svg>
                        )}
                        {link.page === "stories" && (
                          <svg className="w-4 h-4 shrink-0" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.5">
                            <path d="M12 6.042A8.967 8.967 0 006 3.75c-1.052 0-2.062.18-3 .512v14.25A8.987 8.987 0 016 18c2.305 0 4.408.867 6 2.292m0-14.25a8.966 8.966 0 016-2.292c1.052 0 2.062.18 3 .512v14.25A8.987 8.987 0 0018 18a8.967 8.967 0 00-6 2.292m0-14.25v14.25" strokeLinecap="round" strokeLinejoin="round" />
                          </svg>
                        )}
                        {link.page === "settings" && (
                          <svg className="w-4 h-4 shrink-0" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.5">
                            <path d="M9.594 3.94c.09-.542.56-.94 1.11-.94h2.593c.55 0 1.02.398 1.11.94l.213 1.281c.063.374.313.686.645.87.074.04.147.083.22.127.325.196.72.257 1.075.124l1.217-.456a1.125 1.125 0 011.37.49l1.296 2.247a1.125 1.125 0 01-.26 1.431l-1.003.827c-.293.241-.438.613-.43.992a7.723 7.723 0 010 .255c-.008.378.137.75.43.991l1.004.827c.424.35.534.955.26 1.43l-1.298 2.247a1.125 1.125 0 01-1.369.491l-1.217-.456c-.355-.133-.75-.072-1.076.124a6.47 6.47 0 01-.22.128c-.331.183-.581.495-.644.869l-.213 1.281c-.09.543-.56.94-1.11.94h-2.594c-.55 0-1.019-.398-1.11-.94l-.213-1.281c-.062-.374-.312-.686-.644-.87a6.52 6.52 0 01-.22-.127c-.325-.196-.72-.257-1.076-.124l-1.217.456a1.125 1.125 0 01-1.369-.49l-1.297-2.247a1.125 1.125 0 01.26-1.431l1.004-.827c.292-.24.437-.613.43-.991a6.932 6.932 0 010-.255c.007-.38-.138-.751-.43-.992l-1.004-.827a1.125 1.125 0 01-.26-1.43l1.297-2.247a1.125 1.125 0 011.37-.491l1.216.456c.356.133.751.072 1.076-.124.072-.044.146-.086.22-.128.332-.183.582-.495.644-.869l.214-1.28z" />
                            <path d="M15 12a3 3 0 11-6 0 3 3 0 016 0z" />
                          </svg>
                        )}
                        {link.label}
                        {current === link.page && (
                          <span className="ml-auto w-1.5 h-1.5 rounded-full bg-amber-400" />
                        )}
                      </button>
                    ))}
                  </div>
                </motion.div>
              )}
            </AnimatePresence>
          </div>
        </div>
      </div>
    </header>
  );
}
