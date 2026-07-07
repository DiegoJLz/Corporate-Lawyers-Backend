export interface CfdiConcepto {
  claveProducto: string;
  claveUnidad: string;
  cantidad: number;
  descripcion: string;
  valorUnitario: number;
  importe: number;
}

export interface CfdiInvoiceData {
  emisor: {
    rfc: string;
    nombre: string;
    regimenFiscal: string;
  };
  receptor: {
    rfc: string;
    nombre: string;
    usoCfdi: string;
    domicilioFiscalReceptor: string;
    regimenFiscalReceptor: string;
  };
  conceptos: CfdiConcepto[];
  subtotal: number;
  total: number;
  moneda: string;
  formaPago: string;
  metodoPago: string;
  serie: string;
  folio: string;
}

export interface CfdiResult {
  uuid: string;
  xmlUrl: string;
  pdfUrl: string;
  status: string;
}

export interface ICfdiProvider {
  stamp(data: CfdiInvoiceData): Promise<CfdiResult>;
  cancel(uuid: string, motivo: string): Promise<CfdiResult>;
  getStatus(uuid: string): Promise<CfdiResult>;
}
