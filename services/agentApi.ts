import { User } from '../types';
import { getActiveCompanyId, getActiveStoreId } from './api';

const AGENT_URL_RAW = String(import.meta.env.VITE_KLISK_AGENT_URL || 'http://localhost:8080').trim();
const AGENT_API_KEY = String(import.meta.env.VITE_KLISK_API_KEY || '').trim();
const AGENT_NAME = String(import.meta.env.VITE_KLISK_AGENT_NAME || 'VALNI DataCopilot').trim();
const AGENT_TIMEOUT_MS = Number(import.meta.env.VITE_KLISK_TIMEOUT_MS || 60000);

const normalizeAgentUrl = (value: string): string => {
  const cleaned = value.replace(/\/+$/, '');
  if (cleaned.endsWith('/api/chat')) {
    return cleaned;
  }
  return `${cleaned}/api/chat`;
};

const AGENT_CHAT_URL = normalizeAgentUrl(AGENT_URL_RAW);

export interface AgentConversationState {
  previous_response_id?: string;
  conversation_history?: Array<Record<string, unknown>>;
  current_agent_name?: string;
  was_litellm?: boolean;
}

export interface AskSemanticAgentParams {
  question: string;
  currentUser: User;
  activeStoreId?: string;
  conversationState?: AgentConversationState;
}

export interface AskSemanticAgentResult {
  response: string;
  state: AgentConversationState;
}

const buildAgentMessage = (
  question: string,
  context: Record<string, string | null>
): string => [
  'Contexto tecnico obligatorio (no mostrar literal al usuario, solo usar para ejecutar tools):',
  JSON.stringify(context),
  '',
  `Pregunta del usuario: ${question.trim()}`
].join('\n');

const parseErrorMessage = async (response: Response): Promise<string> => {
  const fallback = `Error HTTP ${response.status} al consultar el agente.`;
  try {
    const payload = await response.json() as { error?: string; message?: string };
    return String(payload.error || payload.message || fallback);
  } catch {
    return fallback;
  }
};

export const askSemanticAgent = async (params: AskSemanticAgentParams): Promise<AskSemanticAgentResult> => {
  const trimmedQuestion = params.question.trim();
  if (!trimmedQuestion) {
    throw new Error('La consulta no puede estar vacia.');
  }

  const resolvedCompanyId = params.currentUser.companyId || getActiveCompanyId();
  if (!resolvedCompanyId) {
    throw new Error('No se pudo resolver company_id para la consulta semantica.');
  }

  const resolvedStoreId =
    params.activeStoreId ||
    params.currentUser.activeStoreId ||
    getActiveStoreId() ||
    null;

  const now = new Date();

  const agentMessage = buildAgentMessage(trimmedQuestion, {
    company_id: resolvedCompanyId,
    store_id: resolvedStoreId,
    user_id: params.currentUser.id || null,
    user_role: params.currentUser.role || null,
    timezone: 'America/Lima',
    now_iso: now.toISOString()
  });

  const headers: Record<string, string> = {
    'Content-Type': 'application/json'
  };
  if (AGENT_API_KEY) {
    headers.Authorization = `Bearer ${AGENT_API_KEY}`;
  }

  const body: Record<string, unknown> = {
    message: agentMessage,
    stream: false,
    state: params.conversationState || {}
  };
  if (AGENT_NAME) {
    body.agent_name = AGENT_NAME;
  }

  const sendRequest = async (timeoutMs: number): Promise<Response> => {
    const controller = new AbortController();
    const timeout = window.setTimeout(() => controller.abort(), timeoutMs);
    try {
      return await fetch(AGENT_CHAT_URL, {
        method: 'POST',
        headers,
        body: JSON.stringify(body),
        signal: controller.signal
      });
    } finally {
      window.clearTimeout(timeout);
    }
  };

  let response: Response;
  try {
    response = await sendRequest(AGENT_TIMEOUT_MS);
  } catch (error) {
    if (error instanceof Error && error.name === 'AbortError') {
      try {
        response = await sendRequest(Math.min(AGENT_TIMEOUT_MS * 2, 120000));
      } catch (retryError) {
        if (retryError instanceof Error && retryError.name === 'AbortError') {
          throw new Error('La consulta al agente supero el tiempo maximo de espera.');
        }
        throw new Error('No se pudo conectar con el agente Klisk.');
      }
    } else {
      throw new Error('No se pudo conectar con el agente Klisk.');
    }
  }

  if (!response.ok) {
    throw new Error(await parseErrorMessage(response));
  }

  const payload = await response.json() as {
    response?: string;
    state?: AgentConversationState;
  };

  const responseText = String(payload?.response || '').trim();
  return {
    response: responseText || 'No hubo respuesta del agente.',
    state: (payload?.state && typeof payload.state === 'object') ? payload.state : {}
  };
};
