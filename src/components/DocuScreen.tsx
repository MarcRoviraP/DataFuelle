import React, { useState, useEffect } from 'react'
import { BookOpen, ChevronLeft, ChevronRight, X, List, Sparkles, FileText } from 'lucide-react'
import readmeRaw from '../../README.md?raw'
import rubricaRaw from '../../RUBRICA.md?raw'

// --- Markdown Tokenizer & Renderer ---
function parseInlines(text: string): React.ReactNode[] {
  const regex = /(\*\*.*?\*\*|`.*?`|\$\$.*?\$\$)/g
  const parts = text.split(regex)

  return parts.map((part, idx) => {
    if (part.startsWith('**') && part.endsWith('**')) {
      return <strong key={idx} className="font-black text-slate-900 dark:text-slate-100">{part.slice(2, -2)}</strong>
    }
    if (part.startsWith('`') && part.endsWith('`')) {
      return <code key={idx} className="px-1.5 py-0.5 rounded bg-slate-100 dark:bg-slate-800 text-pink-600 dark:text-pink-400 font-mono text-[11px] sm:text-xs font-semibold">{part.slice(1, -1)}</code>
    }
    if (part.startsWith('$$') && part.endsWith('$$')) {
      return <span key={idx} className="font-mono bg-slate-100 dark:bg-slate-800 px-1 py-0.5 rounded text-slate-800 dark:text-slate-200 font-bold">{part.slice(2, -2)}</span>
    }
    return part
  })
}

const MarkdownRenderer = ({ content }: { content: string }) => {
  const lines = content.split('\n')
  const elements: React.ReactNode[] = []
  let isInsideCodeBlock = false
  let codeBlockLanguage = ''
  let codeBlockLines: string[] = []
  let keyIndex = 0

  for (let i = 0; i < lines.length; i++) {
    const line = lines[i]

    // Detectar bloques de código
    if (line.trim().startsWith('```')) {
      if (isInsideCodeBlock) {
        const codeText = codeBlockLines.join('\n')
        elements.push(
          <div key={`code-${keyIndex++}`} className="relative my-4 rounded-xl overflow-hidden border border-slate-200 dark:border-slate-700 bg-slate-950 font-mono text-[11px] sm:text-xs text-slate-200 shadow-xl group">
            <div className="flex items-center justify-between px-4 py-2 bg-slate-900 border-b border-slate-800 text-[10px] text-slate-400 font-bold uppercase tracking-wider">
              <span>{codeBlockLanguage || 'code'}</span>
              <button
                onClick={() => navigator.clipboard.writeText(codeText)}
                className="hover:text-white transition-colors cursor-pointer active:scale-95 px-2 py-1 rounded bg-slate-800 hover:bg-slate-700 text-[9px]"
              >
                Copiar
              </button>
            </div>
            <pre className="p-4 overflow-x-auto leading-relaxed">
              <code>{codeText}</code>
            </pre>
          </div>
        )
        isInsideCodeBlock = false
        codeBlockLines = []
      } else {
        isInsideCodeBlock = true
        codeBlockLanguage = line.trim().substring(3) || 'code'
      }
      continue
    }

    if (isInsideCodeBlock) {
      codeBlockLines.push(line)
      continue
    }

    // Detectar blockquotes / alertas
    if (line.trim().startsWith('>')) {
      let quoteLines = []
      let j = i
      while (j < lines.length && lines[j].trim().startsWith('>')) {
        quoteLines.push(lines[j].trim().replace(/^>\s?/, ''))
        j++
      }
      i = j - 1

      const quoteText = quoteLines.join('\n')
      let alertType = 'NOTE'
      let cleanText = quoteText

      if (quoteText.includes('[!NOTE]')) {
        alertType = 'NOTE'
        cleanText = quoteText.replace('[!NOTE]', '').trim()
      } else if (quoteText.includes('[!IMPORTANT]')) {
        alertType = 'IMPORTANT'
        cleanText = quoteText.replace('[!IMPORTANT]', '').trim()
      } else if (quoteText.includes('[!WARNING]')) {
        alertType = 'WARNING'
        cleanText = quoteText.replace('[!WARNING]', '').trim()
      } else if (quoteText.includes('[!TIP]')) {
        alertType = 'TIP'
        cleanText = quoteText.replace('[!TIP]', '').trim()
      }

      const alertStyles = 
        alertType === 'IMPORTANT' ? { border: 'border-l-4 border-red-500 bg-red-50/50 dark:bg-red-950/20 text-red-950 dark:text-red-200', titleColor: 'text-red-800 dark:text-red-400', label: 'Importante' } :
        alertType === 'WARNING' ? { border: 'border-l-4 border-amber-500 bg-amber-50/50 dark:bg-amber-950/20 text-amber-950 dark:text-amber-200', titleColor: 'text-amber-800 dark:text-amber-400', label: 'Advertencia' } :
        alertType === 'TIP' ? { border: 'border-l-4 border-emerald-500 bg-emerald-50/50 dark:bg-emerald-950/20 text-emerald-950 dark:text-emerald-200', titleColor: 'text-emerald-800 dark:text-emerald-400', label: 'Consejo' } :
        { border: 'border-l-4 border-blue-500 bg-blue-50/50 dark:bg-blue-950/20 text-blue-950 dark:text-blue-200', titleColor: 'text-blue-800 dark:text-blue-400', label: 'Nota' }

      elements.push(
        <div key={`quote-${keyIndex++}`} className={`my-4 p-4 rounded-r-xl ${alertStyles.border} text-xs sm:text-sm`}>
          <span className={`block font-black text-[10px] uppercase tracking-wider mb-1 ${alertStyles.titleColor}`}>
            {alertStyles.label}
          </span>
          <p className="leading-relaxed font-medium whitespace-pre-wrap">{cleanText}</p>
        </div>
      )
      continue
    }

    // Encabezados
    if (line.startsWith('# ')) {
      elements.push(
        <h1 key={`h1-${keyIndex++}`} className="text-xl sm:text-2xl font-black text-slate-900 dark:text-slate-100 border-b border-slate-100 dark:border-slate-800 pb-3 mb-6 mt-2 leading-tight">
          {parseInlines(line.substring(2))}
        </h1>
      )
      continue
    }
    if (line.startsWith('## ')) {
      elements.push(
        <h2 key={`h2-${keyIndex++}`} className="text-lg sm:text-xl font-black text-slate-800 dark:text-slate-200 mt-6 mb-4 pb-2 border-b border-slate-100 dark:border-slate-800 flex items-center gap-2">
          <span className="w-1 h-5 bg-purple-500 rounded-full" />
          {parseInlines(line.substring(3))}
        </h2>
      )
      continue
    }
    if (line.startsWith('### ')) {
      elements.push(
        <h3 key={`h3-${keyIndex++}`} className="text-sm sm:text-base font-extrabold text-slate-800 dark:text-slate-200 mt-5 mb-2">
          {parseInlines(line.substring(4))}
        </h3>
      )
      continue
    }

    // Listas
    if (line.trim().startsWith('- ') || line.trim().startsWith('* ')) {
      let listItems = []
      let j = i
      while (j < lines.length && (lines[j].trim().startsWith('- ') || lines[j].trim().startsWith('* '))) {
        listItems.push(lines[j].trim().substring(2))
        j++
      }
      i = j - 1

      elements.push(
        <ul key={`list-${keyIndex++}`} className="space-y-1.5 my-3 pl-5 list-disc text-slate-600 dark:text-slate-300 text-xs sm:text-sm">
          {listItems.map((item, idx) => (
            <li key={idx} className="leading-relaxed">
              {parseInlines(item)}
            </li>
          ))}
        </ul>
      )
      continue
    }

    if (line.trim() === '') {
      continue
    }

    elements.push(
      <p key={`p-${keyIndex++}`} className="text-slate-600 dark:text-slate-300 text-xs sm:text-sm leading-relaxed mb-3 font-normal">
        {parseInlines(line)}
      </p>
    )
  }

  return <div className="space-y-2">{elements}</div>
}

// --- Parseador de Secciones del Markdown ---
interface Section {
  title: string;
  content: string;
}

function getMarkdownSections(md: string): Section[] {
  const cleanMd = md.replace(/\r\n/g, '\n')
  const parts = cleanMd.split(/\n## /g)
  const sections: Section[] = []

  // Primera parte: Título e introducción
  if (parts[0]) {
    const firstPart = parts[0]
    const lines = firstPart.split('\n')
    const titleLine = lines.find(l => l.startsWith('# '))
    const title = titleLine ? titleLine.replace('# ', '').trim() : 'Introducción'
    sections.push({
      title,
      content: firstPart
    })
  }

  // Siguientes partes basadas en encabezados "##"
  for (let i = 1; i < parts.length; i++) {
    const part = parts[i]
    const lines = part.split('\n')
    const title = lines[0].trim()
    const content = lines.slice(1).join('\n')
    sections.push({
      title,
      content: `## ${title}\n${content}`
    })
  }

  return sections
}

// --- Componente Principal ---
export const DocuScreen = () => {
  const [activeDoc, setActiveDoc] = useState<'readme' | 'rubrica'>('readme')
  const [currentPage, setCurrentPage] = useState(0)
  const [isMobileIndexOpen, setIsMobileIndexOpen] = useState(false)

  // Obtener secciones basadas en el documento activo
  const activeContent = activeDoc === 'readme' ? readmeRaw : rubricaRaw
  const sections = getMarkdownSections(activeContent)

  // Resetear paginación al cambiar de documento
  useEffect(() => {
    setCurrentPage(0)
    setIsMobileIndexOpen(false)
  }, [activeDoc])

  const handleClose = () => {
    // Volver a la ruta raíz sin recargar usando pushState nativo
    window.history.pushState({}, '', '/')
    const navEvent = new PopStateEvent('popstate')
    window.dispatchEvent(navEvent)
  }

  const handlePrev = () => {
    if (currentPage > 0) {
      setCurrentPage(prev => prev - 1)
      window.scrollTo({ top: 0, behavior: 'smooth' })
    }
  }

  const handleNext = () => {
    if (currentPage < sections.length - 1) {
      setCurrentPage(prev => prev + 1)
      window.scrollTo({ top: 0, behavior: 'smooth' })
    }
  }

  const currentSection = sections[currentPage] || { title: '', content: '' }

  return (
    <div className="min-h-screen w-screen bg-slate-950 text-slate-100 flex flex-col font-sans overflow-x-hidden selection:bg-purple-500 selection:text-white">
      {/* Background Decorative Blobs */}
      <div className="absolute top-[-10%] left-[-10%] w-[50vw] h-[50vw] rounded-full bg-blue-500/10 blur-[120px] pointer-events-none" />
      <div className="absolute bottom-[-10%] right-[-10%] w-[50vw] h-[50vw] rounded-full bg-purple-500/10 blur-[120px] pointer-events-none" />

      {/* Header Premium (Glassmorphism) */}
      <header className="sticky top-0 z-50 w-full bg-slate-900/80 backdrop-blur-xl border-b border-slate-800/80 px-6 py-4 flex items-center justify-between">
        <div className="flex items-center gap-3">
          <div className="p-2.5 bg-gradient-to-br from-purple-600 to-blue-600 rounded-xl shadow-lg shadow-purple-500/20 flex items-center justify-center">
            <BookOpen size={20} className="text-white" />
          </div>
          <div>
            <h1 className="text-base font-black tracking-wide text-white uppercase flex items-center gap-2">
              DataFuelle Docs
              <span className="text-[9px] font-bold bg-purple-500/20 text-purple-400 border border-purple-500/30 px-2 py-0.5 rounded-full uppercase tracking-widest">
                Interactive
              </span>
            </h1>
            <p className="text-[10px] text-slate-400 font-bold">Documentación Oficial del Sistema</p>
          </div>
        </div>

        {/* Document Selector (Tabs) */}
        <div className="hidden md:flex items-center gap-1 bg-slate-950 p-1.5 rounded-2xl border border-slate-800/80">
          <button
            onClick={() => setActiveDoc('readme')}
            className={`flex items-center gap-2 px-4 py-2 rounded-xl text-xs font-black uppercase tracking-wider transition-all duration-300 ${
              activeDoc === 'readme'
                ? 'bg-gradient-to-r from-purple-600 to-blue-600 text-white shadow-md'
                : 'text-slate-400 hover:text-slate-200'
            }`}
          >
            <Sparkles size={14} />
            Guía de Inicio
          </button>
          <button
            onClick={() => setActiveDoc('rubrica')}
            className={`flex items-center gap-2 px-4 py-2 rounded-xl text-xs font-black uppercase tracking-wider transition-all duration-300 ${
              activeDoc === 'rubrica'
                ? 'bg-gradient-to-r from-purple-600 to-blue-600 text-white shadow-md'
                : 'text-slate-400 hover:text-slate-200'
            }`}
          >
            <FileText size={14} />
            Especificaciones Técnicas
          </button>
        </div>

        {/* Close Button */}
        <button
          onClick={handleClose}
          className="p-2.5 bg-slate-800 hover:bg-slate-700 text-slate-300 hover:text-white rounded-xl transition-all shadow-md active:scale-95 flex items-center gap-2 text-xs font-black uppercase tracking-wider border border-slate-700"
        >
          <span className="hidden sm:inline">Volver a la App</span>
          <X size={16} />
        </button>
      </header>

      {/* Mobile document tabs */}
      <div className="md:hidden flex p-3 bg-slate-900 border-b border-slate-800/60 gap-2">
        <button
          onClick={() => setActiveDoc('readme')}
          className={`flex-1 flex items-center justify-center gap-2 py-2.5 rounded-xl text-[10px] font-black uppercase tracking-wider transition-all ${
            activeDoc === 'readme'
              ? 'bg-purple-600 text-white shadow-lg'
              : 'bg-slate-950 text-slate-400'
          }`}
        >
          <Sparkles size={12} />
          Guía de Inicio
        </button>
        <button
          onClick={() => setActiveDoc('rubrica')}
          className={`flex-1 flex items-center justify-center gap-2 py-2.5 rounded-xl text-[10px] font-black uppercase tracking-wider transition-all ${
            activeDoc === 'rubrica'
              ? 'bg-purple-600 text-white shadow-lg'
              : 'bg-slate-950 text-slate-400'
          }`}
        >
          <FileText size={12} />
          Especificaciones
        </button>
      </div>

      {/* Layout Content */}
      <div className="flex-1 flex w-full relative">
        
        {/* Sidebar Index (Desktop) */}
        <aside className="hidden lg:block w-[320px] bg-slate-950/80 border-r border-slate-900 p-6 shrink-0 h-[calc(100vh-81px)] sticky top-[81px] overflow-y-auto">
          <div className="flex items-center gap-2 text-slate-400 text-[10px] font-black uppercase tracking-wider mb-4">
            <List size={14} />
            <span>Índice del Documento</span>
          </div>

          <div className="space-y-1.5">
            {sections.map((sec, index) => (
              <button
                key={index}
                onClick={() => {
                  setCurrentPage(index)
                  window.scrollTo({ top: 0, behavior: 'smooth' })
                }}
                className={`w-full text-left px-4 py-3 rounded-xl transition-all text-xs font-bold leading-snug flex items-start gap-3 ${
                  index === currentPage
                    ? 'bg-purple-500/10 text-purple-400 border-l-4 border-purple-500 pl-3 font-extrabold'
                    : 'text-slate-400 hover:bg-slate-900/50 hover:text-slate-200 border-l-4 border-transparent'
                }`}
              >
                <span className={`text-[10px] font-mono shrink-0 mt-0.5 ${index === currentPage ? 'text-purple-400' : 'text-slate-600'}`}>
                  {String(index + 1).padStart(2, '0')}
                </span>
                <span className="truncate">{sec.title}</span>
              </button>
            ))}
          </div>
        </aside>

        {/* Main Document Reader Panel */}
        <main className="flex-1 min-w-0 p-6 md:p-10 flex flex-col items-center">
          <div className="w-full max-w-3xl bg-slate-900/40 border border-slate-800/80 rounded-3xl p-6 md:p-10 shadow-2xl backdrop-blur-md relative flex-1 flex flex-col justify-between">
            
            {/* Section Reader */}
            <div className="prose prose-invert max-w-none mb-10">
              <MarkdownRenderer content={currentSection.content} />
            </div>

            {/* Paginación */}
            <div className="pt-6 border-t border-slate-800/80 flex flex-col sm:flex-row items-center justify-between gap-4 mt-auto">
              <button
                onClick={handlePrev}
                disabled={currentPage === 0}
                className="w-full sm:w-auto px-5 py-3 rounded-2xl bg-slate-800 hover:bg-slate-700 disabled:opacity-30 disabled:hover:bg-slate-800 text-slate-200 disabled:text-slate-500 text-xs font-black uppercase tracking-wider flex items-center justify-center gap-2 transition-all active:scale-95 border border-slate-700/60 cursor-pointer disabled:cursor-not-allowed"
              >
                <ChevronLeft size={16} />
                Anterior
              </button>

              <div className="flex flex-col items-center gap-1.5">
                <span className="text-[10px] font-bold text-slate-500 uppercase tracking-widest">
                  Página {currentPage + 1} de {sections.length}
                </span>
                
                {/* Burbujas de Progreso */}
                <div className="flex items-center gap-1.5 max-w-[200px] overflow-x-auto py-1">
                  {sections.map((_, idx) => (
                    <button
                      key={idx}
                      onClick={() => {
                        setCurrentPage(idx)
                        window.scrollTo({ top: 0, behavior: 'smooth' })
                      }}
                      className={`h-1.5 rounded-full transition-all duration-300 ${
                        idx === currentPage
                          ? 'w-6 bg-purple-500'
                          : 'w-1.5 bg-slate-800 hover:bg-slate-600'
                      }`}
                    />
                  ))}
                </div>
              </div>

              <button
                onClick={handleNext}
                disabled={currentPage === sections.length - 1}
                className="w-full sm:w-auto px-5 py-3 rounded-2xl bg-gradient-to-r from-purple-600 to-blue-600 hover:opacity-90 disabled:opacity-30 disabled:from-slate-800 disabled:to-slate-800 text-white disabled:text-slate-500 text-xs font-black uppercase tracking-wider flex items-center justify-center gap-2 transition-all active:scale-95 cursor-pointer disabled:cursor-not-allowed"
              >
                Siguiente
                <ChevronRight size={16} />
              </button>
            </div>

          </div>
        </main>
      </div>

      {/* Floating Index Button (Mobile Only) */}
      <button
        onClick={() => setIsMobileIndexOpen(true)}
        className="lg:hidden fixed bottom-6 right-6 z-[1000] p-4 bg-gradient-to-r from-purple-600 to-blue-600 text-white rounded-full shadow-2xl transition-all active:scale-95 flex items-center justify-center border border-white/10"
      >
        <List size={22} />
      </button>

      {/* Mobile Index Modal */}
      {isMobileIndexOpen && (
        <div className="lg:hidden fixed inset-0 z-[2000] flex">
          {/* Backdrop */}
          <div
            className="absolute inset-0 bg-slate-950/80 backdrop-blur-sm"
            onClick={() => setIsMobileIndexOpen(false)}
          />
          {/* Drawer Panel */}
          <div className="relative ml-auto h-full w-[280px] sm:w-[320px] bg-slate-900 border-l border-slate-800 p-6 flex flex-col justify-between shadow-2xl">
            <div>
              <div className="flex items-center justify-between mb-6">
                <div className="flex items-center gap-2 text-slate-300 text-[10px] font-black uppercase tracking-wider">
                  <List size={14} />
                  <span>Secciones</span>
                </div>
                <button
                  onClick={() => setIsMobileIndexOpen(false)}
                  className="p-1.5 bg-slate-800 hover:bg-slate-700 rounded-lg text-slate-400 hover:text-white"
                >
                  <X size={16} />
                </button>
              </div>

              <div className="space-y-1.5 overflow-y-auto max-h-[calc(100vh-120px)] pr-2">
                {sections.map((sec, index) => (
                  <button
                    key={index}
                    onClick={() => {
                      setCurrentPage(index)
                      setIsMobileIndexOpen(false)
                      window.scrollTo({ top: 0, behavior: 'smooth' })
                    }}
                    className={`w-full text-left px-4 py-3 rounded-xl transition-all text-xs font-bold leading-snug flex items-start gap-3 ${
                      index === currentPage
                        ? 'bg-purple-500/10 text-purple-400 border-l-4 border-purple-500 pl-3 font-extrabold'
                        : 'text-slate-400 hover:bg-slate-800 hover:text-slate-200 border-l-4 border-transparent'
                    }`}
                  >
                    <span className="text-[10px] font-mono text-slate-500 mt-0.5">
                      {String(index + 1).padStart(2, '0')}
                    </span>
                    <span className="truncate">{sec.title}</span>
                  </button>
                ))}
              </div>
            </div>
          </div>
        </div>
      )}
    </div>
  )
}
