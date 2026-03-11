// Chrome Extension API type declarations for web-to-extension messaging

declare namespace chrome {
  namespace runtime {
    const lastError: { message?: string } | undefined;
    function sendMessage(
      extensionId: string,
      message: unknown,
      callback?: (response: unknown) => void
    ): void;
  }
}
