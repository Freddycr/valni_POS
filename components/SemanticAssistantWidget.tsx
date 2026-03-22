import React, { useEffect, useMemo, useRef, useState } from 'react';
import { User } from '../types';
import { AgentConversationState, askSemanticAgent } from '../services/agentApi';

interface SemanticAssistantWidgetProps {
  currentUser: User;
  activeStoreId: string;
}

type WidgetRole = 'user' | 'assistant';

interface WidgetMessage {
  id: string;
  role: WidgetRole;
  content: string;
}

const QUICK_ACTIONS = [
  'Ventas de hoy',
  'Ventas de ayer',
  'Ventas de los ultimos 7 dias',
  'Inventario por ubicacion (Tienda / Almacen)'
];

const createMessage = (role: WidgetRole, content: string): WidgetMessage => ({
  id: `${Date.now()}-${Math.random().toString(16).slice(2)}`,
  role,
  content
});

const SemanticAssistantWidget: React.FC<SemanticAssistantWidgetProps> = ({ currentUser, activeStoreId }) => {
  const [isOpen, setIsOpen] = useState(false);
  const [inputValue, setInputValue] = useState('');
  const [isSending, setIsSending] = useState(false);
  const [companyName, setCompanyName] = useState<string>('No definida');
  const [errorMessage, setErrorMessage] = useState<string | null>(null);
  const [lastQuestion, setLastQuestion] = useState<string>('');
  const [conversationState, setConversationState] = useState<AgentConversationState>({});
  const [messages, setMessages] = useState<WidgetMessage[]>([
    createMessage(
      'assistant',
      'Hola, soy VALNI DataCopilot. Puedo ayudarte con ventas, operaciones por DNI/IMEI/SN e inventario.'
    )
  ]);

  const canSend = useMemo(
    () => !isSending && inputValue.trim().length > 0,
    [isSending, inputValue]
  );

  const messagesBottomRef = useRef<HTMLDivElement | null>(null);

  useEffect(() => {
    messagesBottomRef.current?.scrollIntoView({ behavior: 'smooth', block: 'end' });
  }, [messages, isOpen]);

  useEffect(() => {
    let isMounted = true;
    const resolveCompanyName = async () => {
      const companyId = currentUser.companyId;
      const runtimeCompanyName =
        ((currentUser as unknown as { companyName?: string }).companyName || '').trim();

      if (!companyId) {
        if (isMounted) setCompanyName(runtimeCompanyName || 'No definida');
        return;
      }

      if (runtimeCompanyName) {
        if (isMounted) setCompanyName(runtimeCompanyName);
        return;
      }

      try {
        const api = await import('../services/api');
        const companies = typeof api.getCompanies === 'function' ? await api.getCompanies() : [];
        const matched = companies.find((company: { id: string; name: string }) => company.id === companyId);
        if (isMounted) setCompanyName((matched?.name || '').trim() || 'No definida');
      } catch {
        if (isMounted) setCompanyName('No definida');
      }
    };

    void resolveCompanyName();
    return () => {
      isMounted = false;
    };
  }, [currentUser]);

  const appendMessage = (role: WidgetRole, content: string) => {
    setMessages(prev => [...prev, createMessage(role, content)]);
  };

  const sendQuestion = async (question: string, options?: { retry?: boolean }) => {
    const normalized = question.trim();
    if (!normalized) return;

    const isRetry = !!options?.retry;
    setErrorMessage(null);

    if (!isRetry) {
      appendMessage('user', normalized);
      setLastQuestion(normalized);
    }

    setIsSending(true);
    try {
      const result = await askSemanticAgent({
        question: normalized,
        currentUser,
        activeStoreId,
        conversationState
      });

      setConversationState(result.state || {});
      appendMessage('assistant', result.response);
    } catch (error) {
      const message = error instanceof Error
        ? error.message
        : 'Error desconocido al consultar el asistente.';
      setErrorMessage(message);
    } finally {
      setIsSending(false);
    }
  };

  const handleSubmit = async () => {
    const question = inputValue.trim();
    if (!question) return;
    setInputValue('');
    await sendQuestion(question);
  };

  const handleRetry = async () => {
    if (!lastQuestion || isSending) return;
    await sendQuestion(lastQuestion, { retry: true });
  };

  const handleQuickAction = async (value: string) => {
    if (isSending) return;
    setIsOpen(true);
    await sendQuestion(value);
  };

  return (
    <div className="fixed bottom-5 right-5 z-[60]">
      {isOpen ? (
        <div className="flex h-[560px] w-[380px] max-w-[95vw] flex-col overflow-hidden rounded-2xl border border-slate-200 bg-white shadow-2xl">
          <div className="flex items-center justify-between border-b border-slate-200 bg-slate-900 px-4 py-3 text-white">
            <div>
              <p className="text-sm font-semibold tracking-wide">VALNI DataCopilot</p>
              <p className="text-[11px] text-slate-200">Empresa: {companyName}</p>
            </div>
            <button
              type="button"
              onClick={() => setIsOpen(false)}
              className="rounded-md border border-slate-200 bg-white px-2 py-1 text-xs font-semibold text-slate-900 hover:bg-slate-100"
            >
              Cerrar
            </button>
          </div>

          <div className="flex flex-wrap gap-2 border-b border-slate-200 px-3 py-2">
            {QUICK_ACTIONS.map(item => (
              <button
                key={item}
                type="button"
                onClick={() => handleQuickAction(item)}
                disabled={isSending}
                className="rounded-full border border-slate-300 px-3 py-1 text-xs text-slate-700 hover:border-slate-400 hover:bg-slate-50 disabled:opacity-60"
              >
                {item}
              </button>
            ))}
          </div>

          <div className="custom-scrollbar flex-1 overflow-y-auto bg-slate-50 px-3 py-3">
            <div className="space-y-2">
              {messages.map(message => (
                <div
                  key={message.id}
                  className={`max-w-[90%] rounded-xl px-3 py-2 text-sm whitespace-pre-wrap ${
                    message.role === 'user'
                      ? 'ml-auto bg-emerald-600 text-white'
                      : 'mr-auto border border-slate-200 bg-white text-slate-900'
                  }`}
                >
                  {message.content}
                </div>
              ))}
              {isSending && (
                <div className="mr-auto max-w-[85%] rounded-xl border border-slate-200 bg-white px-3 py-2 text-xs text-slate-500">
                  Procesando consulta...
                </div>
              )}
              <div ref={messagesBottomRef} />
            </div>
          </div>

          {errorMessage && (
            <div className="border-t border-red-200 bg-red-50 px-3 py-2">
              <p className="text-xs text-red-700">{errorMessage}</p>
              <button
                type="button"
                onClick={handleRetry}
                disabled={!lastQuestion || isSending}
                className="mt-2 rounded-md border border-red-300 px-2 py-1 text-xs text-red-700 hover:bg-red-100 disabled:opacity-60"
              >
                Reintentar
              </button>
            </div>
          )}

          <div className="border-t border-slate-200 bg-white p-3">
            <textarea
              value={inputValue}
              onChange={event => setInputValue(event.target.value)}
              onKeyDown={event => {
                if (event.key === 'Enter' && !event.shiftKey) {
                  event.preventDefault();
                  if (canSend) void handleSubmit();
                }
              }}
              rows={2}
              className="w-full resize-none rounded-xl border border-slate-300 px-3 py-2 text-sm text-slate-900 focus:border-emerald-500 focus:outline-none focus:ring-1 focus:ring-emerald-500"
              placeholder="Consulta ventas, operaciones, stock..."
            />
            <div className="mt-2 flex items-center justify-between">
              <p className="text-[11px] text-slate-500">Enter envia, Shift+Enter nueva linea.</p>
              <button
                type="button"
                onClick={() => void handleSubmit()}
                disabled={!canSend}
                className="rounded-lg bg-emerald-600 px-4 py-2 text-xs font-semibold text-white hover:bg-emerald-500 disabled:cursor-not-allowed disabled:opacity-50"
              >
                Enviar
              </button>
            </div>
          </div>
        </div>
      ) : (
        <button
          type="button"
          onClick={() => setIsOpen(true)}
          className="rounded-full bg-emerald-600 px-5 py-3 text-sm font-semibold text-white shadow-lg transition hover:bg-emerald-500"
        >
          DataCopilot
        </button>
      )}
    </div>
  );
};

export default SemanticAssistantWidget;
