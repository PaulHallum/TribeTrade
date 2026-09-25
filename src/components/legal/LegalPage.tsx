import { useEffect } from 'react';
import ReactMarkdown from 'react-markdown';
import privacyMd from '../../../docs/PRIVACY_POLICY.md?raw';
import termsMd from '../../../docs/TERMS_OF_SERVICE.md?raw';
import deletionMd from '../../../docs/DATA_DELETION.md?raw';
import guideMd from '../../../docs/USER_GUIDE.md?raw';

export default function LegalPage({ docType }: { docType: string }) {
  let content = '';
  let title = '';

  switch (docType) {
    case 'privacy':
    case 'privacy-policy':
      content = privacyMd;
      title = 'Privacy Policy';
      break;
    case 'terms':
    case 'terms-of-service':
      content = termsMd;
      title = 'Terms of Service';
      break;
    case 'deletion':
    case 'data-deletion':
      content = deletionMd;
      title = 'Data Deletion';
      break;
    case 'guide':
    case 'user-guide':
      content = guideMd;
      title = 'User Guide';
      break;
    default:
      content = 'Document not found.';
      title = 'Not Found';
  }

  useEffect(() => {
    document.title = `${title} | Tribe`;
  }, [title]);

  return (
    <div className="min-h-screen bg-zinc-50 dark:bg-zinc-950 text-zinc-900 dark:text-zinc-100 p-6 sm:p-12 font-sans overflow-y-auto">
      <div className="max-w-3xl mx-auto bg-white dark:bg-zinc-900 p-8 rounded-3xl border border-zinc-200 dark:border-zinc-800 shadow-sm">
        <a href="/" className="inline-block mb-8 px-4 py-2 bg-emerald-50 text-emerald-700 dark:bg-emerald-900/30 dark:text-emerald-400 rounded-xl hover:bg-emerald-100 dark:hover:bg-emerald-900/50 transition-colors font-bold text-sm">
          &larr; Back to Tribe
        </a>
        <div className="prose dark:prose-invert prose-emerald max-w-none">
          <ReactMarkdown>{content}</ReactMarkdown>
        </div>
      </div>
    </div>
  );
}
