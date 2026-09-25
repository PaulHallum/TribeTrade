import React from 'react';
import { LucideIcon, Clock } from 'lucide-react';
import { motion } from 'motion/react';
import { format } from 'date-fns';

interface HeaderAction {
  label: string;
  icon?: LucideIcon;
  onClick: () => void;
  primary?: boolean;
}

interface PageHeaderProps {
  icon: LucideIcon;
  title: string;
  subtitle?: React.ReactNode;
  actions?: HeaderAction[];
  extra?: React.ReactNode;
  lastRun?: Date;
  metaText?: React.ReactNode;
}

export default function PageHeader({ 
  icon: Icon, 
  title, 
  subtitle, 
  actions, 
  extra,
  lastRun,
  metaText
}: PageHeaderProps) {
  return (
    <div className="flex flex-col gap-4 mb-5">
      <div className="flex flex-row items-start justify-between gap-3 sm:gap-4">
        <div className="flex items-start gap-3 sm:gap-4 min-w-0">
          <div className="shrink-0 pt-0.5">
            <div 
              className="w-12 h-12 sm:w-14 sm:h-14 rounded-2xl flex items-center justify-center shrink-0"
              style={{ 
                backgroundColor: 'color-mix(in srgb, var(--icon-color) 15%, transparent)',
                color: 'var(--icon-color)' 
              }}
            >
              <Icon size={24} className="sm:w-7 sm:h-7" />
            </div>
          </div>
          <div className="min-w-0 flex flex-col justify-start py-0.5">
            <h1 className="text-sm sm:text-base font-extrabold text-slate-900 dark:text-white leading-tight truncate" title={typeof title === 'string' ? title : undefined}>
              {title}
            </h1>
            {subtitle && (
              <div className="text-xs sm:text-sm text-slate-500 dark:text-slate-400 mt-0.5 break-words">
                {subtitle}
              </div>
            )}
            {(lastRun || metaText) && (
              <div className="flex flex-wrap items-center gap-1.5 mt-1 text-[10px] font-bold text-slate-400 dark:text-slate-500 uppercase tracking-tight">
                {lastRun && (
                  <div className="flex items-center gap-1">
                    <Clock size={10} />
                    <span>Last run: {format(lastRun, 'MMM d, HH:mm')}</span>
                  </div>
                )}
                {lastRun && metaText && <span>•</span>}
                {metaText && (
                  <span className="text-emerald-600 dark:text-emerald-400 font-extrabold">{metaText}</span>
                )}
              </div>
            )}
          </div>
        </div>
        {extra && (
          <div className="flex flex-col items-end justify-between shrink-0 py-0.5">
            <div className="flex items-center gap-2">
              {extra}
            </div>
          </div>
        )}
      </div>

      {actions && actions.length > 0 && (
        <div className="flex flex-wrap gap-2">
          {actions.map((action, index) => (
            <motion.button
              key={index}
              whileHover={{ scale: 1.02 }}
              whileTap={{ scale: 0.98 }}
              onClick={action.onClick}
              className={`flex items-center gap-1.5 px-4 py-2 rounded-xl text-xs font-bold transition-all shadow-sm ${
                action.primary
                  ? 'bg-blue-600 text-white hover:bg-blue-700 shadow-blue-200 dark:shadow-none'
                  : 'bg-gradient-to-r from-emerald-500/10 to-blue-500/10 text-slate-700 dark:text-slate-200 border border-emerald-500/20 dark:border-emerald-400/10 hover:from-emerald-500/20 hover:to-blue-500/20'
              }`}
            >
              {action.icon && <action.icon size={14} />}
              {action.label}
            </motion.button>
          ))}
        </div>
      )}
    </div>
  );
}
