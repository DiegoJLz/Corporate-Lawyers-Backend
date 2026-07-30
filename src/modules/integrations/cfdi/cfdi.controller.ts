import { Controller, Post, Get, Param, Body, ParseUUIDPipe } from '@nestjs/common';
import { ApiTags, ApiOperation, ApiBearerAuth } from '@nestjs/swagger';
import { UserRole } from '@prisma/client';
import { CfdiService } from './cfdi.service';
import { StampInvoiceDto } from './dto/stamp-invoice.dto';
import { CancelCfdiDto } from './dto/cancel-cfdi.dto';
import { Roles } from '../../../core/security/decorators/roles.decorator';
import { CurrentUser } from '../../../core/security/decorators/current-user.decorator';

@ApiTags('Billing - CFDI')
@ApiBearerAuth()
@Controller({ version: '1', path: 'invoices' })
export class CfdiController {
  constructor(private readonly cfdiService: CfdiService) {}

  // Static route must be defined before parameterized :id routes
  @Get('cfdi/catalogs')
  @Roles(UserRole.SUPER_ADMIN, UserRole.ADMIN, UserRole.LAWYER)
  @ApiOperation({ summary: 'Get SAT CFDI catalogs (uso, forma de pago, metodo, regimen)' })
  getCatalogs() {
    return {
      usoCfdi: [
        { code: 'G01', name: 'Adquisicion de mercancias' },
        { code: 'G02', name: 'Devoluciones, descuentos o bonificaciones' },
        { code: 'G03', name: 'Gastos en general' },
        { code: 'I01', name: 'Construcciones' },
        { code: 'I02', name: 'Mobiliario y equipo de oficina por inversiones' },
        { code: 'I03', name: 'Equipo de transporte' },
        { code: 'I04', name: 'Equipo de computo y accesorios' },
        { code: 'I08', name: 'Otra maquinaria y equipo' },
        { code: 'D01', name: 'Honorarios medicos, dentales y gastos hospitalarios' },
        { code: 'D02', name: 'Gastos medicos por incapacidad o discapacidad' },
        { code: 'D03', name: 'Gastos funerales' },
        { code: 'D04', name: 'Donativos' },
        { code: 'D05', name: 'Intereses reales efectivamente pagados por creditos hipotecarios' },
        { code: 'D06', name: 'Aportaciones voluntarias al SAR' },
        { code: 'D07', name: 'Primas por seguros de gastos medicos' },
        { code: 'D08', name: 'Gastos de transportacion escolar obligatoria' },
        { code: 'D10', name: 'Pagos por servicios educativos (colegiaturas)' },
        { code: 'P01', name: 'Por definir' },
        { code: 'S01', name: 'Sin efectos fiscales' },
        { code: 'CP01', name: 'Pagos' },
        { code: 'CN01', name: 'Nomina' },
      ],
      formaPago: [
        { code: '01', name: 'Efectivo' },
        { code: '02', name: 'Cheque nominativo' },
        { code: '03', name: 'Transferencia electronica de fondos' },
        { code: '04', name: 'Tarjeta de credito' },
        { code: '05', name: 'Monedero electronico' },
        { code: '06', name: 'Dinero electronico' },
        { code: '08', name: 'Vales de despensa' },
        { code: '12', name: 'Dacion en pago' },
        { code: '13', name: 'Pago por subrogacion' },
        { code: '14', name: 'Pago por consignacion' },
        { code: '15', name: 'Condonacion' },
        { code: '17', name: 'Compensacion' },
        { code: '23', name: 'Novacion' },
        { code: '24', name: 'Confusion' },
        { code: '25', name: 'Remision de deuda' },
        { code: '26', name: 'Prescripcion o caducidad' },
        { code: '27', name: 'A satisfaccion del acreedor' },
        { code: '28', name: 'Tarjeta de debito' },
        { code: '29', name: 'Tarjeta de servicios' },
        { code: '30', name: 'Aplicacion de anticipos' },
        { code: '31', name: 'Intermediario pagos' },
        { code: '99', name: 'Por definir' },
      ],
      metodoPago: [
        { code: 'PUE', name: 'Pago en una sola exhibicion' },
        { code: 'PPD', name: 'Pago en parcialidades o diferido' },
      ],
      regimenFiscal: [
        { code: '601', name: 'General de Ley Personas Morales' },
        { code: '603', name: 'Personas Morales con Fines no Lucrativos' },
        { code: '605', name: 'Sueldos y Salarios e Ingresos Asimilados a Salarios' },
        { code: '606', name: 'Arrendamiento' },
        { code: '607', name: 'Regimen de Enajenacion o Adquisicion de Bienes' },
        { code: '608', name: 'Demas ingresos' },
        { code: '610', name: 'Residentes en el Extranjero sin Establecimiento Permanente en Mexico' },
        { code: '611', name: 'Ingresos por Dividendos (socios y accionistas)' },
        { code: '612', name: 'Personas Fisicas con Actividades Empresariales y Profesionales' },
        { code: '614', name: 'Ingresos por intereses' },
        { code: '615', name: 'Regimen de los ingresos por obtencion de premios' },
        { code: '616', name: 'Sin obligaciones fiscales' },
        { code: '620', name: 'Sociedades Cooperativas de Produccion que optan por diferir sus ingresos' },
        { code: '621', name: 'Incorporacion Fiscal' },
        { code: '622', name: 'Actividades Agricolas, Ganaderas, Silvicolas y Pesqueras' },
        { code: '623', name: 'Opcional para Grupos de Sociedades' },
        { code: '624', name: 'Coordinados' },
        { code: '625', name: 'Regimen de las Actividades Empresariales con ingresos a traves de Plataformas Tecnologicas' },
        { code: '626', name: 'Regimen Simplificado de Confianza' },
      ],
    };
  }

  @Post(':id/cfdi/stamp')
  @Roles(UserRole.SUPER_ADMIN, UserRole.ADMIN)
  @ApiOperation({ summary: 'Stamp CFDI for an invoice' })
  async stamp(
    @Param('id', ParseUUIDPipe) id: string,
    @Body() dto: StampInvoiceDto,
    @CurrentUser('userId') userId: string,
  ) {
    return this.cfdiService.stampInvoice(id, dto, userId);
  }

  @Post(':id/cfdi/cancel')
  @Roles(UserRole.SUPER_ADMIN, UserRole.ADMIN)
  @ApiOperation({ summary: 'Cancel CFDI for an invoice' })
  async cancel(
    @Param('id', ParseUUIDPipe) id: string,
    @Body() dto: CancelCfdiDto,
    @CurrentUser('userId') userId: string,
  ) {
    return this.cfdiService.cancelCfdi(id, dto, userId);
  }

  @Get(':id/cfdi/status')
  @Roles(UserRole.SUPER_ADMIN, UserRole.ADMIN, UserRole.LAWYER)
  @ApiOperation({ summary: 'Get CFDI status for an invoice' })
  async getStatus(@Param('id', ParseUUIDPipe) id: string) {
    return this.cfdiService.getStatus(id);
  }

  @Get(':id/cfdi/xml')
  @Roles(UserRole.SUPER_ADMIN, UserRole.ADMIN, UserRole.LAWYER, UserRole.CLIENT)
  @ApiOperation({ summary: 'Download CFDI XML' })
  async downloadXml(@Param('id', ParseUUIDPipe) id: string) {
    return this.cfdiService.downloadXml(id);
  }
}
