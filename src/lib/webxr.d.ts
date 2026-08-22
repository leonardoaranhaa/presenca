interface Navigator {
  xr?: {
    isSessionSupported(mode: string): Promise<boolean>;
    requestSession(
      mode: string,
      options?: { optionalFeatures?: string[] },
    ): Promise<{ addEventListener: (type: string, fn: () => void) => void }>;
  };
}
