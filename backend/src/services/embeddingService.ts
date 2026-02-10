import { ClipXenovaProvider } from '../providers/embedding/clipXenovaProvider';

export class EmbeddingService {
  private provider: ClipXenovaProvider;

  constructor(provider: ClipXenovaProvider) {
    this.provider = provider;
  }

  async embedImage(buffer: Buffer): Promise<number[]> {
    return this.provider.embedBuffer(buffer);
  }
}
