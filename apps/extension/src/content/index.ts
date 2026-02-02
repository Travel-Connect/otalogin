/**
 * Content Script
 * OTAサイト上でログイン処理を実行する
 */

import { CHANNEL_CONFIGS } from '@otalogin/shared';
import type { ChannelCode } from '@otalogin/shared';

interface LoginPayload {
  job_id: string;
  channel_code: ChannelCode;
  login_id: string;
  password: string;
  extra_fields: Record<string, string>;
}

/**
 * Background からのメッセージを受信
 */
chrome.runtime.onMessage.addListener(
  (
    message: { type: string; payload: LoginPayload },
    _sender: chrome.runtime.MessageSender,
    sendResponse: (response: unknown) => void
  ) => {
    if (message.type === 'EXECUTE_LOGIN') {
      executeLogin(message.payload)
        .then((result) => sendResponse(result))
        .catch((error) => {
          sendResponse({
            success: false,
            error: error instanceof Error ? error.message : 'Unknown error',
          });
        });
      return true;
    }
  }
);

/**
 * ログイン処理を実行
 */
async function executeLogin(payload: LoginPayload): Promise<{ success: boolean; error?: string }> {
  const { job_id, channel_code, login_id, password, extra_fields } = payload;

  const config = CHANNEL_CONFIGS[channel_code];
  if (!config) {
    await reportResult(job_id, 'failed', 'Unknown channel');
    return { success: false, error: 'Unknown channel' };
  }

  try {
    // ユーザー名を入力
    const usernameInput = await waitForElement(config.selectors.username);
    if (!usernameInput) {
      throw new Error('Username input not found');
    }
    await typeIntoField(usernameInput, login_id);

    // パスワードを入力
    const passwordInput = await waitForElement(config.selectors.password);
    if (!passwordInput) {
      throw new Error('Password input not found');
    }
    await typeIntoField(passwordInput, password);

    // 追加フィールドを入力
    if (config.extra_fields) {
      for (const field of config.extra_fields) {
        const value = extra_fields[field.key];
        if (value) {
          const input = await waitForElement(field.selector);
          if (input) {
            await typeIntoField(input, value);
          }
        }
      }
    }

    // ログインボタンをクリック
    const submitButton = await waitForElement(config.selectors.submit);
    if (!submitButton) {
      throw new Error('Submit button not found');
    }
    (submitButton as HTMLElement).click();

    // ログイン成功の確認
    const success = await waitForLoginSuccess(config.selectors.success_indicator);

    if (success) {
      await reportResult(job_id, 'success');
      return { success: true };
    } else {
      await reportResult(job_id, 'failed', 'Login success indicator not found');
      return { success: false, error: 'Login may have failed' };
    }
  } catch (error) {
    const message = error instanceof Error ? error.message : 'Unknown error';
    await reportResult(job_id, 'failed', message);
    return { success: false, error: message };
  }
}

/**
 * 要素の出現を待つ
 */
function waitForElement(selector: string, timeout = 10000): Promise<Element | null> {
  return new Promise((resolve) => {
    const element = document.querySelector(selector);
    if (element) {
      resolve(element);
      return;
    }

    const observer = new MutationObserver(() => {
      const el = document.querySelector(selector);
      if (el) {
        observer.disconnect();
        resolve(el);
      }
    });

    observer.observe(document.body, {
      childList: true,
      subtree: true,
    });

    setTimeout(() => {
      observer.disconnect();
      resolve(null);
    }, timeout);
  });
}

/**
 * フィールドに入力
 */
async function typeIntoField(element: Element, value: string): Promise<void> {
  const input = element as HTMLInputElement;
  input.focus();
  input.value = value;
  input.dispatchEvent(new Event('input', { bubbles: true }));
  input.dispatchEvent(new Event('change', { bubbles: true }));
}

/**
 * ログイン成功を待つ
 */
function waitForLoginSuccess(selector: string, timeout = 30000): Promise<boolean> {
  return new Promise((resolve) => {
    const check = () => {
      const element = document.querySelector(selector);
      if (element) {
        resolve(true);
        return true;
      }
      return false;
    };

    if (check()) return;

    const observer = new MutationObserver(() => {
      if (check()) {
        observer.disconnect();
      }
    });

    observer.observe(document.body, {
      childList: true,
      subtree: true,
    });

    setTimeout(() => {
      observer.disconnect();
      resolve(false);
    }, timeout);
  });
}

/**
 * 結果をBackground Scriptに報告
 */
async function reportResult(
  jobId: string,
  status: 'success' | 'failed',
  errorMessage?: string
): Promise<void> {
  chrome.runtime.sendMessage({
    type: 'LOGIN_RESULT',
    payload: {
      job_id: jobId,
      status,
      error_message: errorMessage,
    },
  });
}
