export interface SignerInfo {
  name: string;
  email: string;
  order?: number;
}

export interface SignatureRequest {
  documentTitle: string;
  documentUrl: string;
  signers: SignerInfo[];
  callbackUrl: string;
  message?: string;
}

export interface SignatureResult {
  externalId: string;
  signingUrl: string;
  status: string;
}

export interface ISignatureProvider {
  createRequest(request: SignatureRequest): Promise<SignatureResult>;
  getStatus(externalId: string): Promise<SignatureResult>;
  downloadSigned(externalId: string): Promise<Buffer>;
  cancelRequest(externalId: string): Promise<void>;
}
