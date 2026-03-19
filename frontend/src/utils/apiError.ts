type ApiValidationItem = {
  msg?: string;
  loc?: Array<string | number>;
};

type ApiErrorShape = {
  response?: {
    data?: {
      detail?: string | ApiValidationItem[] | Record<string, unknown>;
    };
  };
};

export function getApiErrorMessage(error: unknown, fallback: string): string {
  if (!error || typeof error !== 'object' || !('response' in error)) {
    return fallback;
  }

  const detail = (error as ApiErrorShape).response?.data?.detail;

  if (typeof detail === 'string' && detail.trim()) {
    return detail;
  }

  if (Array.isArray(detail)) {
    const messages = detail
      .map((item) => {
        if (!item || typeof item !== 'object') return null;
        const field = Array.isArray(item.loc) ? String(item.loc[item.loc.length - 1] ?? '') : '';
        const msg = typeof item.msg === 'string' ? item.msg : '';
        if (!msg) return null;
        return field ? `${field}: ${msg}` : msg;
      })
      .filter((message): message is string => Boolean(message));

    if (messages.length > 0) {
      return messages.join(' | ');
    }
  }

  return fallback;
}
