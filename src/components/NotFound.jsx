import React from 'react';
import { Link } from 'react-router-dom';
import { Compass } from 'lucide-react';

/**
 * ⚠️ THE ROUTE TABLE HAD NO `path="*"`, AND `firebase.json` REWRITES EVERYTHING TO
 *    `index.html`. So a mistyped or stale URL — `/individuals/from`, a link shared
 *    with a truncated path, a bookmark from an older build — loaded the whole SPA
 *    and then rendered NOTHING. No 404, no redirect, no message: a blank white
 *    page, indistinguishable from a broken site.
 *
 *    That matters most for the public portal, whose visitors arrive from a QR
 *    code, a printed handout or a link forwarded by somebody else, and who have no
 *    reason to suspect a typo rather than a service that does not work.
 *
 * Deliberately plain: no `DICTIONARY` lookup, because a person who reached here by
 * mistake may never have chosen a language, and no `useNavigate` redirect, because
 * silently moving somebody somewhere they did not ask for is how the blank page
 * felt in the first place. It says what happened and offers the two doors.
 */
export default function NotFound() {
  return (
    <div className="min-h-screen flex items-center justify-center bg-slate-50 dark:bg-[#0B1120] px-6">
      <div className="max-w-md text-center">
        <div className="inline-flex p-4 rounded-2xl bg-slate-100 dark:bg-slate-800 text-slate-400 mb-6">
          <Compass size={32} />
        </div>
        <h1 className="text-2xl font-black text-slate-900 dark:text-white mb-3">
          This page does not exist
        </h1>
        <p className="text-sm text-slate-600 dark:text-slate-400 leading-relaxed mb-8">
          The link may be incomplete, or the page may have moved. Nothing has gone wrong
          with your device.
        </p>
        <div className="flex flex-col sm:flex-row gap-3 justify-center">
          <Link
            to="/individuals/language"
            className="px-5 py-3 rounded-xl bg-teal-600 hover:bg-teal-700 text-white font-bold text-xs uppercase tracking-widest transition-colors"
          >
            Start a health check
          </Link>
          <Link
            to="/"
            className="px-5 py-3 rounded-xl border border-slate-200 dark:border-slate-700 text-slate-600 dark:text-slate-300 font-bold text-xs uppercase tracking-widest hover:bg-slate-100 dark:hover:bg-slate-800 transition-colors"
          >
            Staff sign in
          </Link>
        </div>
      </div>
    </div>
  );
}
