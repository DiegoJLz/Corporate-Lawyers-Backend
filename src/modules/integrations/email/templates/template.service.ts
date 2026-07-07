import { Injectable, Logger } from '@nestjs/common';
import * as Handlebars from 'handlebars';

@Injectable()
export class TemplateService {
  private readonly logger = new Logger(TemplateService.name);
  private readonly compiledTemplates = new Map<string, Handlebars.TemplateDelegate>();

  private readonly templates: Record<string, string> = {
    welcome: `
<!DOCTYPE html>
<html>
<head><meta charset="utf-8"></head>
<body style="font-family: 'Helvetica Neue', Arial, sans-serif; background-color: #f4f6f8; margin: 0; padding: 0;">
  <table width="100%" cellpadding="0" cellspacing="0" style="max-width: 600px; margin: 0 auto; background-color: #ffffff;">
    <tr><td style="background-color: #1a365d; padding: 24px; text-align: center;">
      <h1 style="color: #ffffff; margin: 0; font-size: 22px;">Corporate Lawyers</h1>
    </td></tr>
    <tr><td style="padding: 32px 24px;">
      <h2 style="color: #1a365d; margin-top: 0;">Bienvenido, {{firstName}}!</h2>
      <p style="color: #4a5568; line-height: 1.6;">Gracias por registrarte en nuestra plataforma. Tu cuenta ha sido creada exitosamente.</p>
      <p style="color: #4a5568; line-height: 1.6;">Puedes acceder al portal de clientes para:</p>
      <ul style="color: #4a5568; line-height: 1.8;">
        <li>Consultar el estado de tus casos</li>
        <li>Revisar facturas y pagos</li>
        <li>Comunicarte con tu equipo legal</li>
      </ul>
      {{#if loginUrl}}
      <p style="text-align: center; margin-top: 24px;">
        <a href="{{loginUrl}}" style="background-color: #2b6cb0; color: #ffffff; padding: 12px 32px; text-decoration: none; border-radius: 4px; display: inline-block;">Acceder al Portal</a>
      </p>
      {{/if}}
    </td></tr>
    <tr><td style="background-color: #edf2f7; padding: 16px 24px; text-align: center; color: #718096; font-size: 12px;">
      &copy; {{year}} Corporate Lawyers. Todos los derechos reservados.
    </td></tr>
  </table>
</body>
</html>`,

    'case-status-update': `
<!DOCTYPE html>
<html>
<head><meta charset="utf-8"></head>
<body style="font-family: 'Helvetica Neue', Arial, sans-serif; background-color: #f4f6f8; margin: 0; padding: 0;">
  <table width="100%" cellpadding="0" cellspacing="0" style="max-width: 600px; margin: 0 auto; background-color: #ffffff;">
    <tr><td style="background-color: #1a365d; padding: 24px; text-align: center;">
      <h1 style="color: #ffffff; margin: 0; font-size: 22px;">Corporate Lawyers</h1>
    </td></tr>
    <tr><td style="padding: 32px 24px;">
      <h2 style="color: #1a365d; margin-top: 0;">Actualización de Caso</h2>
      <p style="color: #4a5568; line-height: 1.6;">Estimado/a {{clientName}},</p>
      <p style="color: #4a5568; line-height: 1.6;">Le informamos que su caso <strong>{{caseNumber}}</strong> ha sido actualizado.</p>
      <table width="100%" style="border-collapse: collapse; margin: 16px 0;">
        <tr><td style="padding: 8px; border: 1px solid #e2e8f0; background-color: #f7fafc; font-weight: bold; color: #4a5568;">Caso</td>
            <td style="padding: 8px; border: 1px solid #e2e8f0;">{{caseTitle}}</td></tr>
        <tr><td style="padding: 8px; border: 1px solid #e2e8f0; background-color: #f7fafc; font-weight: bold; color: #4a5568;">Estado anterior</td>
            <td style="padding: 8px; border: 1px solid #e2e8f0;">{{previousStatus}}</td></tr>
        <tr><td style="padding: 8px; border: 1px solid #e2e8f0; background-color: #f7fafc; font-weight: bold; color: #4a5568;">Nuevo estado</td>
            <td style="padding: 8px; border: 1px solid #e2e8f0; color: #2b6cb0; font-weight: bold;">{{newStatus}}</td></tr>
      </table>
      {{#if message}}
      <p style="color: #4a5568; line-height: 1.6;">{{message}}</p>
      {{/if}}
    </td></tr>
    <tr><td style="background-color: #edf2f7; padding: 16px 24px; text-align: center; color: #718096; font-size: 12px;">
      &copy; {{year}} Corporate Lawyers. Todos los derechos reservados.
    </td></tr>
  </table>
</body>
</html>`,

    'invoice-sent': `
<!DOCTYPE html>
<html>
<head><meta charset="utf-8"></head>
<body style="font-family: 'Helvetica Neue', Arial, sans-serif; background-color: #f4f6f8; margin: 0; padding: 0;">
  <table width="100%" cellpadding="0" cellspacing="0" style="max-width: 600px; margin: 0 auto; background-color: #ffffff;">
    <tr><td style="background-color: #1a365d; padding: 24px; text-align: center;">
      <h1 style="color: #ffffff; margin: 0; font-size: 22px;">Corporate Lawyers</h1>
    </td></tr>
    <tr><td style="padding: 32px 24px;">
      <h2 style="color: #1a365d; margin-top: 0;">Nueva Factura</h2>
      <p style="color: #4a5568; line-height: 1.6;">Estimado/a {{clientName}},</p>
      <p style="color: #4a5568; line-height: 1.6;">Se ha emitido la factura <strong>{{invoiceNumber}}</strong> asociada a su caso.</p>
      <table width="100%" style="border-collapse: collapse; margin: 16px 0;">
        <tr><td style="padding: 8px; border: 1px solid #e2e8f0; background-color: #f7fafc; font-weight: bold; color: #4a5568;">Factura</td>
            <td style="padding: 8px; border: 1px solid #e2e8f0;">{{invoiceNumber}}</td></tr>
        <tr><td style="padding: 8px; border: 1px solid #e2e8f0; background-color: #f7fafc; font-weight: bold; color: #4a5568;">Total</td>
            <td style="padding: 8px; border: 1px solid #e2e8f0; font-weight: bold; color: #2b6cb0;">\${{total}}</td></tr>
        <tr><td style="padding: 8px; border: 1px solid #e2e8f0; background-color: #f7fafc; font-weight: bold; color: #4a5568;">Fecha de vencimiento</td>
            <td style="padding: 8px; border: 1px solid #e2e8f0;">{{dueDate}}</td></tr>
      </table>
      {{#if portalUrl}}
      <p style="text-align: center; margin-top: 24px;">
        <a href="{{portalUrl}}" style="background-color: #2b6cb0; color: #ffffff; padding: 12px 32px; text-decoration: none; border-radius: 4px; display: inline-block;">Ver Factura</a>
      </p>
      {{/if}}
    </td></tr>
    <tr><td style="background-color: #edf2f7; padding: 16px 24px; text-align: center; color: #718096; font-size: 12px;">
      &copy; {{year}} Corporate Lawyers. Todos los derechos reservados.
    </td></tr>
  </table>
</body>
</html>`,

    'payment-received': `
<!DOCTYPE html>
<html>
<head><meta charset="utf-8"></head>
<body style="font-family: 'Helvetica Neue', Arial, sans-serif; background-color: #f4f6f8; margin: 0; padding: 0;">
  <table width="100%" cellpadding="0" cellspacing="0" style="max-width: 600px; margin: 0 auto; background-color: #ffffff;">
    <tr><td style="background-color: #1a365d; padding: 24px; text-align: center;">
      <h1 style="color: #ffffff; margin: 0; font-size: 22px;">Corporate Lawyers</h1>
    </td></tr>
    <tr><td style="padding: 32px 24px;">
      <h2 style="color: #1a365d; margin-top: 0;">Pago Recibido</h2>
      <p style="color: #4a5568; line-height: 1.6;">Estimado/a {{clientName}},</p>
      <p style="color: #4a5568; line-height: 1.6;">Hemos recibido su pago. A continuacion los detalles:</p>
      <table width="100%" style="border-collapse: collapse; margin: 16px 0;">
        <tr><td style="padding: 8px; border: 1px solid #e2e8f0; background-color: #f7fafc; font-weight: bold; color: #4a5568;">Factura</td>
            <td style="padding: 8px; border: 1px solid #e2e8f0;">{{invoiceNumber}}</td></tr>
        <tr><td style="padding: 8px; border: 1px solid #e2e8f0; background-color: #f7fafc; font-weight: bold; color: #4a5568;">Monto pagado</td>
            <td style="padding: 8px; border: 1px solid #e2e8f0; font-weight: bold; color: #38a169;">\${{amountPaid}}</td></tr>
        <tr><td style="padding: 8px; border: 1px solid #e2e8f0; background-color: #f7fafc; font-weight: bold; color: #4a5568;">Metodo</td>
            <td style="padding: 8px; border: 1px solid #e2e8f0;">{{paymentMethod}}</td></tr>
        <tr><td style="padding: 8px; border: 1px solid #e2e8f0; background-color: #f7fafc; font-weight: bold; color: #4a5568;">Referencia</td>
            <td style="padding: 8px; border: 1px solid #e2e8f0;">{{reference}}</td></tr>
      </table>
      <p style="color: #4a5568; line-height: 1.6;">Gracias por su pago oportuno.</p>
    </td></tr>
    <tr><td style="background-color: #edf2f7; padding: 16px 24px; text-align: center; color: #718096; font-size: 12px;">
      &copy; {{year}} Corporate Lawyers. Todos los derechos reservados.
    </td></tr>
  </table>
</body>
</html>`,

    'new-message': `
<!DOCTYPE html>
<html>
<head><meta charset="utf-8"></head>
<body style="font-family: 'Helvetica Neue', Arial, sans-serif; background-color: #f4f6f8; margin: 0; padding: 0;">
  <table width="100%" cellpadding="0" cellspacing="0" style="max-width: 600px; margin: 0 auto; background-color: #ffffff;">
    <tr><td style="background-color: #1a365d; padding: 24px; text-align: center;">
      <h1 style="color: #ffffff; margin: 0; font-size: 22px;">Corporate Lawyers</h1>
    </td></tr>
    <tr><td style="padding: 32px 24px;">
      <h2 style="color: #1a365d; margin-top: 0;">Nuevo Mensaje</h2>
      <p style="color: #4a5568; line-height: 1.6;">Hola {{recipientName}},</p>
      <p style="color: #4a5568; line-height: 1.6;">Has recibido un nuevo mensaje de <strong>{{senderName}}</strong>:</p>
      <div style="background-color: #f7fafc; border-left: 4px solid #2b6cb0; padding: 16px; margin: 16px 0; color: #4a5568;">
        {{messagePreview}}
      </div>
      {{#if portalUrl}}
      <p style="text-align: center; margin-top: 24px;">
        <a href="{{portalUrl}}" style="background-color: #2b6cb0; color: #ffffff; padding: 12px 32px; text-decoration: none; border-radius: 4px; display: inline-block;">Ver Mensaje</a>
      </p>
      {{/if}}
    </td></tr>
    <tr><td style="background-color: #edf2f7; padding: 16px 24px; text-align: center; color: #718096; font-size: 12px;">
      &copy; {{year}} Corporate Lawyers. Todos los derechos reservados.
    </td></tr>
  </table>
</body>
</html>`,

    'task-assigned': `
<!DOCTYPE html>
<html>
<head><meta charset="utf-8"></head>
<body style="font-family: 'Helvetica Neue', Arial, sans-serif; background-color: #f4f6f8; margin: 0; padding: 0;">
  <table width="100%" cellpadding="0" cellspacing="0" style="max-width: 600px; margin: 0 auto; background-color: #ffffff;">
    <tr><td style="background-color: #1a365d; padding: 24px; text-align: center;">
      <h1 style="color: #ffffff; margin: 0; font-size: 22px;">Corporate Lawyers</h1>
    </td></tr>
    <tr><td style="padding: 32px 24px;">
      <h2 style="color: #1a365d; margin-top: 0;">Nueva tarea asignada</h2>
      <p style="color: #4a5568; line-height: 1.6;">Hola {{userName}},</p>
      <p style="color: #4a5568; line-height: 1.6;">Se te ha asignado una nueva tarea:</p>
      <table width="100%" style="border-collapse: collapse; margin: 16px 0;">
        <tr><td style="padding: 8px; border: 1px solid #e2e8f0; background-color: #f7fafc; font-weight: bold; color: #4a5568;">Tarea</td>
            <td style="padding: 8px; border: 1px solid #e2e8f0;">{{taskTitle}}</td></tr>
        <tr><td style="padding: 8px; border: 1px solid #e2e8f0; background-color: #f7fafc; font-weight: bold; color: #4a5568;">Caso</td>
            <td style="padding: 8px; border: 1px solid #e2e8f0;">{{caseName}}</td></tr>
        <tr><td style="padding: 8px; border: 1px solid #e2e8f0; background-color: #f7fafc; font-weight: bold; color: #4a5568;">Fecha limite</td>
            <td style="padding: 8px; border: 1px solid #e2e8f0;">{{dueDate}}</td></tr>
      </table>
    </td></tr>
    <tr><td style="background-color: #edf2f7; padding: 16px 24px; text-align: center; color: #718096; font-size: 12px;">
      &copy; {{year}} Corporate Lawyers. Todos los derechos reservados.
    </td></tr>
  </table>
</body>
</html>`,

    'event-reminder': `
<!DOCTYPE html>
<html>
<head><meta charset="utf-8"></head>
<body style="font-family: 'Helvetica Neue', Arial, sans-serif; background-color: #f4f6f8; margin: 0; padding: 0;">
  <table width="100%" cellpadding="0" cellspacing="0" style="max-width: 600px; margin: 0 auto; background-color: #ffffff;">
    <tr><td style="background-color: #1a365d; padding: 24px; text-align: center;">
      <h1 style="color: #ffffff; margin: 0; font-size: 22px;">Corporate Lawyers</h1>
    </td></tr>
    <tr><td style="padding: 32px 24px;">
      <h2 style="color: #1a365d; margin-top: 0;">Recordatorio de evento</h2>
      <p style="color: #4a5568; line-height: 1.6;">Hola {{userName}},</p>
      <p style="color: #4a5568; line-height: 1.6;">Te recordamos que tienes un evento proximo:</p>
      <table width="100%" style="border-collapse: collapse; margin: 16px 0;">
        <tr><td style="padding: 8px; border: 1px solid #e2e8f0; background-color: #f7fafc; font-weight: bold; color: #4a5568;">Evento</td>
            <td style="padding: 8px; border: 1px solid #e2e8f0;">{{eventTitle}}</td></tr>
        <tr><td style="padding: 8px; border: 1px solid #e2e8f0; background-color: #f7fafc; font-weight: bold; color: #4a5568;">Fecha</td>
            <td style="padding: 8px; border: 1px solid #e2e8f0;">{{eventDate}}</td></tr>
        <tr><td style="padding: 8px; border: 1px solid #e2e8f0; background-color: #f7fafc; font-weight: bold; color: #4a5568;">Hora</td>
            <td style="padding: 8px; border: 1px solid #e2e8f0;">{{eventTime}}</td></tr>
        {{#if location}}
        <tr><td style="padding: 8px; border: 1px solid #e2e8f0; background-color: #f7fafc; font-weight: bold; color: #4a5568;">Ubicacion</td>
            <td style="padding: 8px; border: 1px solid #e2e8f0;">{{location}}</td></tr>
        {{/if}}
        {{#if virtualUrl}}
        <tr><td style="padding: 8px; border: 1px solid #e2e8f0; background-color: #f7fafc; font-weight: bold; color: #4a5568;">Enlace virtual</td>
            <td style="padding: 8px; border: 1px solid #e2e8f0;"><a href="{{virtualUrl}}" style="color: #2b6cb0;">Unirse</a></td></tr>
        {{/if}}
      </table>
    </td></tr>
    <tr><td style="background-color: #edf2f7; padding: 16px 24px; text-align: center; color: #718096; font-size: 12px;">
      &copy; {{year}} Corporate Lawyers. Todos los derechos reservados.
    </td></tr>
  </table>
</body>
</html>`,

    'lead-intake-received': `
<!DOCTYPE html>
<html>
<head><meta charset="utf-8"></head>
<body style="font-family: 'Helvetica Neue', Arial, sans-serif; background-color: #f4f6f8; margin: 0; padding: 0;">
  <table width="100%" cellpadding="0" cellspacing="0" style="max-width: 600px; margin: 0 auto; background-color: #ffffff;">
    <tr><td style="background-color: #1a365d; padding: 24px; text-align: center;">
      <h1 style="color: #ffffff; margin: 0; font-size: 22px;">Corporate Lawyers</h1>
    </td></tr>
    <tr><td style="padding: 32px 24px;">
      <h2 style="color: #1a365d; margin-top: 0;">Formulario de intake recibido</h2>
      <p style="color: #4a5568; line-height: 1.6;">Hola {{lawyerName}},</p>
      <p style="color: #4a5568; line-height: 1.6;">Se ha recibido un nuevo formulario de intake:</p>
      <table width="100%" style="border-collapse: collapse; margin: 16px 0;">
        <tr><td style="padding: 8px; border: 1px solid #e2e8f0; background-color: #f7fafc; font-weight: bold; color: #4a5568;">Nombre</td>
            <td style="padding: 8px; border: 1px solid #e2e8f0;">{{leadName}}</td></tr>
        <tr><td style="padding: 8px; border: 1px solid #e2e8f0; background-color: #f7fafc; font-weight: bold; color: #4a5568;">Correo</td>
            <td style="padding: 8px; border: 1px solid #e2e8f0;">{{leadEmail}}</td></tr>
        <tr><td style="padding: 8px; border: 1px solid #e2e8f0; background-color: #f7fafc; font-weight: bold; color: #4a5568;">Area de interes</td>
            <td style="padding: 8px; border: 1px solid #e2e8f0;">{{areaOfInterest}}</td></tr>
      </table>
    </td></tr>
    <tr><td style="background-color: #edf2f7; padding: 16px 24px; text-align: center; color: #718096; font-size: 12px;">
      &copy; {{year}} Corporate Lawyers. Todos los derechos reservados.
    </td></tr>
  </table>
</body>
</html>`,

    'password-reset': `
<!DOCTYPE html>
<html>
<head><meta charset="utf-8"></head>
<body style="font-family: 'Helvetica Neue', Arial, sans-serif; background-color: #f4f6f8; margin: 0; padding: 0;">
  <table width="100%" cellpadding="0" cellspacing="0" style="max-width: 600px; margin: 0 auto; background-color: #ffffff;">
    <tr><td style="background-color: #1a365d; padding: 24px; text-align: center;">
      <h1 style="color: #ffffff; margin: 0; font-size: 22px;">Corporate Lawyers</h1>
    </td></tr>
    <tr><td style="padding: 32px 24px;">
      <h2 style="color: #1a365d; margin-top: 0;">Restablecer contrasena</h2>
      <p style="color: #4a5568; line-height: 1.6;">Hola {{userName}},</p>
      <p style="color: #4a5568; line-height: 1.6;">Recibimos una solicitud para restablecer tu contrasena. Haz clic en el siguiente enlace para continuar:</p>
      <p style="text-align: center; margin-top: 24px;">
        <a href="{{resetUrl}}" style="background-color: #2b6cb0; color: #ffffff; padding: 12px 32px; text-decoration: none; border-radius: 4px; display: inline-block;">Restablecer Contrasena</a>
      </p>
      <p style="color: #4a5568; line-height: 1.6;">Este enlace expira en {{expiresIn}}.</p>
      <p style="color: #718096; line-height: 1.6; font-size: 13px;">Si no solicitaste este cambio, puedes ignorar este correo.</p>
    </td></tr>
    <tr><td style="background-color: #edf2f7; padding: 16px 24px; text-align: center; color: #718096; font-size: 12px;">
      &copy; {{year}} Corporate Lawyers. Todos los derechos reservados.
    </td></tr>
  </table>
</body>
</html>`,

    'signature-request': `
<!DOCTYPE html>
<html>
<head><meta charset="utf-8"></head>
<body style="font-family: 'Helvetica Neue', Arial, sans-serif; background-color: #f4f6f8; margin: 0; padding: 0;">
  <table width="100%" cellpadding="0" cellspacing="0" style="max-width: 600px; margin: 0 auto; background-color: #ffffff;">
    <tr><td style="background-color: #1a365d; padding: 24px; text-align: center;">
      <h1 style="color: #ffffff; margin: 0; font-size: 22px;">Corporate Lawyers</h1>
    </td></tr>
    <tr><td style="padding: 32px 24px;">
      <h2 style="color: #1a365d; margin-top: 0;">Solicitud de firma electronica</h2>
      <p style="color: #4a5568; line-height: 1.6;">Hola {{signerName}},</p>
      <p style="color: #4a5568; line-height: 1.6;"><strong>{{requestedBy}}</strong> te ha solicitado firmar el documento <strong>{{documentTitle}}</strong>.</p>
      <p style="text-align: center; margin-top: 24px;">
        <a href="{{signUrl}}" style="background-color: #2b6cb0; color: #ffffff; padding: 12px 32px; text-decoration: none; border-radius: 4px; display: inline-block;">Firmar Documento</a>
      </p>
    </td></tr>
    <tr><td style="background-color: #edf2f7; padding: 16px 24px; text-align: center; color: #718096; font-size: 12px;">
      &copy; {{year}} Corporate Lawyers. Todos los derechos reservados.
    </td></tr>
  </table>
</body>
</html>`,

    'invoice-pdf': `
<!DOCTYPE html>
<html>
<head><meta charset="utf-8">
<style>
  body { font-family: 'Helvetica Neue', Arial, sans-serif; color: #333; margin: 0; padding: 20px; }
  .header { display: flex; justify-content: space-between; border-bottom: 3px solid #1a365d; padding-bottom: 16px; margin-bottom: 24px; }
  .firm-name { font-size: 24px; font-weight: bold; color: #1a365d; }
  .invoice-title { font-size: 28px; color: #718096; text-align: right; }
  .invoice-meta { text-align: right; color: #4a5568; }
  .section { margin-bottom: 24px; }
  .section-title { font-size: 14px; font-weight: bold; color: #1a365d; text-transform: uppercase; margin-bottom: 8px; border-bottom: 1px solid #e2e8f0; padding-bottom: 4px; }
  table { width: 100%; border-collapse: collapse; }
  th { background-color: #1a365d; color: #fff; padding: 8px 12px; text-align: left; font-size: 12px; }
  td { padding: 8px 12px; border-bottom: 1px solid #e2e8f0; font-size: 13px; }
  .text-right { text-align: right; }
  .totals { margin-top: 16px; }
  .totals td { border: none; padding: 4px 12px; }
  .total-row { font-size: 16px; font-weight: bold; color: #1a365d; }
  .footer { margin-top: 40px; text-align: center; color: #718096; font-size: 11px; border-top: 1px solid #e2e8f0; padding-top: 16px; }
</style>
</head>
<body>
  <div class="header">
    <div>
      <div class="firm-name">Corporate Lawyers</div>
      <div style="color: #718096; font-size: 12px;">Servicios Legales Corporativos</div>
    </div>
    <div>
      <div class="invoice-title">FACTURA</div>
      <div class="invoice-meta">
        <div><strong>{{invoiceNumber}}</strong></div>
        <div>Fecha: {{date}}</div>
        <div>Vencimiento: {{dueDate}}</div>
      </div>
    </div>
  </div>
  <div class="section">
    <div class="section-title">Cliente</div>
    <div>{{clientName}}</div>
    {{#if clientRfc}}<div>RFC: {{clientRfc}}</div>{{/if}}
    {{#if clientAddress}}<div>{{clientAddress}}</div>{{/if}}
  </div>
  <div class="section">
    <div class="section-title">Caso: {{caseNumber}} - {{caseTitle}}</div>
  </div>
  <table>
    <thead>
      <tr>
        <th>Descripcion</th>
        <th class="text-right">Cantidad</th>
        <th class="text-right">Precio Unitario</th>
        <th class="text-right">Importe</th>
      </tr>
    </thead>
    <tbody>
      {{#each items}}
      <tr>
        <td>{{this.description}}</td>
        <td class="text-right">{{this.quantity}}</td>
        <td class="text-right">&#36;{{this.unitPrice}}</td>
        <td class="text-right">&#36;{{this.amount}}</td>
      </tr>
      {{/each}}
    </tbody>
  </table>
  <table class="totals" style="width: 300px; margin-left: auto;">
    <tr><td>Subtotal</td><td class="text-right">\${{subtotal}}</td></tr>
    <tr><td>IVA ({{taxRate}}%)</td><td class="text-right">\${{taxAmount}}</td></tr>
    <tr class="total-row"><td>Total</td><td class="text-right">\${{total}}</td></tr>
  </table>
  {{#if notes}}
  <div class="section" style="margin-top: 24px;">
    <div class="section-title">Notas</div>
    <p>{{notes}}</p>
  </div>
  {{/if}}
  <div class="footer">
    <p>Corporate Lawyers &mdash; Servicios Legales Corporativos</p>
  </div>
</body>
</html>`,
  };

  constructor() {
    // Pre-compile all templates
    for (const [name, source] of Object.entries(this.templates)) {
      this.compiledTemplates.set(name, Handlebars.compile(source));
    }
  }

  render(templateName: string, data: Record<string, unknown>): string {
    const template = this.compiledTemplates.get(templateName);
    if (!template) {
      this.logger.warn(`Template "${templateName}" not found, available: ${Array.from(this.compiledTemplates.keys()).join(', ')}`);
      throw new Error(`Email template "${templateName}" not found`);
    }

    const enrichedData = {
      ...data,
      year: new Date().getFullYear(),
    };

    return template(enrichedData);
  }

  hasTemplate(templateName: string): boolean {
    return this.compiledTemplates.has(templateName);
  }

  getTemplateNames(): string[] {
    return Array.from(this.compiledTemplates.keys());
  }
}
