import PDFDocument from 'pdfkit';
import fs from 'fs';
import path from 'path';

export interface IInvoicePdfData {
  invoiceNumber: string;
  invoiceDate: string;
  rideId: string;
  passenger: {
    name: string;
    phoneNumber: string;
    email?: string;
  };
  rider: {
    name: string;
    phoneNumber: string;
    vehicleNumber?: string;
    vehicleModel?: string;
    vehicleType?: string;
  };
  trip: {
    pickupAddress: string;
    dropAddress: string;
    distanceKm: number;
    durationMinutes: number;
    startTime?: string;
    endTime?: string;
  };
  fare: {
    baseFare: number;
    waitingCharges?: number;
    tipAmount?: number;
    walletAmountUsed?: number;
    totalFare: number;
    paymentMethod: string;
    paymentStatus: string;
    transactionId?: string;
  };
}

export class InvoicePdfService {
  /**
   * Generates a ride invoice PDF as a Buffer
   */
  public static async generateInvoiceBuffer(data: IInvoicePdfData): Promise<Buffer> {
    return new Promise((resolve, reject) => {
      const doc = new PDFDocument({
        size: 'A4',
        margin: 40,
        info: {
          Title: `Woosh Trip Invoice - ${data.invoiceNumber}`,
          Author: 'Woosh Mobility',
        },
      });

      const chunks: Buffer[] = [];
      doc.on('data', (chunk) => chunks.push(chunk));
      doc.on('end', () => resolve(Buffer.concat(chunks)));
      doc.on('error', (err) => reject(err));

      // --- REGISTER UNICODE FONTS FOR INDIAN RUPEE SYMBOL (₹) ---
      let fontRegular = 'Helvetica';
      let fontBold = 'Helvetica-Bold';
      let currencyPrefix = '₹';

      const regularFontPath = path.join(__dirname, '../public/fonts/Roboto-Regular.ttf');
      const boldFontPath = path.join(__dirname, '../public/fonts/Roboto-Bold.ttf');
      const fallbackRegular = path.join(process.cwd(), 'src/public/fonts/Roboto-Regular.ttf');
      const fallbackBold = path.join(process.cwd(), 'src/public/fonts/Roboto-Bold.ttf');

      const resolvedRegular = fs.existsSync(regularFontPath) ? regularFontPath : (fs.existsSync(fallbackRegular) ? fallbackRegular : null);
      const resolvedBold = fs.existsSync(boldFontPath) ? boldFontPath : (fs.existsSync(fallbackBold) ? fallbackBold : null);

      if (resolvedRegular && resolvedBold) {
        doc.registerFont('Roboto', resolvedRegular);
        doc.registerFont('Roboto-Bold', resolvedBold);
        fontRegular = 'Roboto';
        fontBold = 'Roboto-Bold';
        currencyPrefix = '₹';
      } else {
        currencyPrefix = 'Rs. ';
      }

      const primaryColor = '#9C005B'; // Woosh Magenta
      const darkColor = '#111827';
      const grayColor = '#4B5563';
      const lightGray = '#9CA3AF';
      const borderColor = '#E5E7EB';
      const cardBg = '#F9FAFB';

      // ─── TOP ACCENT BAR ───────────────────────────────────────────
      doc.rect(40, 35, 515, 6).fill(primaryColor);

      // ─── HEADER (LOGO & INVOICE TITLE) ────────────────────────────
      const logoPath = path.join(__dirname, '../public/logo.png');
      const fallbackLogo = path.join(process.cwd(), 'src/public/logo.png');

      if (fs.existsSync(logoPath)) {
        doc.image(logoPath, 40, 48, { width: 120 });
      } else if (fs.existsSync(fallbackLogo)) {
        doc.image(fallbackLogo, 40, 48, { width: 120 });
      } else {
        doc.fontSize(22).fillColor(primaryColor).font(fontBold).text('WOOSH', 40, 50);
      }

      doc.fontSize(16).fillColor(darkColor).font(fontBold).text('TAX INVOICE', 350, 48, { align: 'right' });
      doc.fontSize(9).fillColor(grayColor).font(fontRegular).text(`Invoice No: ${data.invoiceNumber}`, 350, 68, { align: 'right' });
      doc.fontSize(9).fillColor(grayColor).font(fontRegular).text(`Date: ${data.invoiceDate}`, 350, 80, { align: 'right' });
      doc.fontSize(9).fillColor(grayColor).font(fontRegular).text(`Ride ID: #${data.rideId.slice(-8).toUpperCase()}`, 350, 92, { align: 'right' });

      // ─── PASSENGER & DRIVER DETAILS (TWO CARDS) ───────────────────
      const infoBoxY = 115;
      const boxWidth = 250;
      const boxHeight = 75;

      // Passenger Card (Left)
      doc.roundedRect(40, infoBoxY, boxWidth, boxHeight, 4).fill(cardBg);
      doc.roundedRect(40, infoBoxY, boxWidth, boxHeight, 4).stroke(borderColor);

      doc.fontSize(8).fillColor(primaryColor).font(fontBold).text('BILLED TO (PASSENGER)', 52, infoBoxY + 10);
      doc.fontSize(11).fillColor(darkColor).font(fontBold).text(data.passenger.name || 'Passenger', 52, infoBoxY + 24);
      doc.fontSize(9).fillColor(grayColor).font(fontRegular).text(`Phone: ${data.passenger.phoneNumber}`, 52, infoBoxY + 40);
      if (data.passenger.email) {
        doc.fontSize(8).fillColor(lightGray).font(fontRegular).text(`Email: ${data.passenger.email}`, 52, infoBoxY + 54);
      }

      // Rider & Vehicle Card (Right)
      const rightBoxX = 305;
      doc.roundedRect(rightBoxX, infoBoxY, boxWidth, boxHeight, 4).fill(cardBg);
      doc.roundedRect(rightBoxX, infoBoxY, boxWidth, boxHeight, 4).stroke(borderColor);

      doc.fontSize(8).fillColor(primaryColor).font(fontBold).text('DRIVER & VEHICLE DETAILS', rightBoxX + 12, infoBoxY + 10);
      doc.fontSize(11).fillColor(darkColor).font(fontBold).text(data.rider.name || 'Woosh Driver', rightBoxX + 12, infoBoxY + 24);
      doc.fontSize(9).fillColor(grayColor).font(fontRegular).text(`Vehicle: ${data.rider.vehicleNumber || 'N/A'} (${data.rider.vehicleType || 'Ride'})`, rightBoxX + 12, infoBoxY + 40);
      doc.fontSize(9).fillColor(grayColor).font(fontRegular).text(`Contact: ${data.rider.phoneNumber}`, rightBoxX + 12, infoBoxY + 54);

      // ─── TRIP ROUTE & DURATION CARD ──────────────────────────────
      const routeY = 205;
      doc.roundedRect(40, routeY, 515, 85, 4).fill(cardBg);
      doc.roundedRect(40, routeY, 515, 85, 4).stroke(borderColor);

      doc.fontSize(8).fillColor(primaryColor).font(fontBold).text('TRIP DETAILS', 52, routeY + 10);

      // Pickup point
      doc.circle(56, routeY + 30, 4).fill('#10B981'); // Green dot
      doc.fontSize(9).fillColor(darkColor).font(fontBold).text('Pickup:', 66, routeY + 26);
      doc.fontSize(9).fillColor(grayColor).font(fontRegular).text(data.trip.pickupAddress, 110, routeY + 26, { width: 320, height: 14, ellipsis: true });
      if (data.trip.startTime) {
        doc.fontSize(8).fillColor(lightGray).font(fontRegular).text(data.trip.startTime, 440, routeY + 26, { align: 'right' });
      }

      // Drop point
      doc.circle(56, routeY + 52, 4).fill('#EF4444'); // Red dot
      doc.fontSize(9).fillColor(darkColor).font(fontBold).text('Drop:', 66, routeY + 48);
      doc.fontSize(9).fillColor(grayColor).font(fontRegular).text(data.trip.dropAddress, 110, routeY + 48, { width: 320, height: 14, ellipsis: true });
      if (data.trip.endTime) {
        doc.fontSize(8).fillColor(lightGray).font(fontRegular).text(data.trip.endTime, 440, routeY + 48, { align: 'right' });
      }

      // Distance & Duration summary line
      doc.fontSize(8).fillColor(grayColor).font(fontBold).text(
        `Total Distance: ${data.trip.distanceKm.toFixed(1)} km   •   Trip Duration: ${data.trip.durationMinutes} mins`,
        52,
        routeY + 70
      );

      // ─── FARE BREAKDOWN TABLE ─────────────────────────────────────
      let tableY = 310;
      doc.fontSize(12).fillColor(darkColor).font(fontBold).text('Fare Breakdown', 40, tableY);
      tableY += 20;

      // Table Header
      doc.rect(40, tableY, 515, 24).fill(primaryColor);
      doc.fontSize(9).fillColor('#FFFFFF').font(fontBold).text('DESCRIPTION', 55, tableY + 7);
      doc.fontSize(9).fillColor('#FFFFFF').font(fontBold).text('AMOUNT', 450, tableY + 7, { align: 'right' });
      tableY += 24;

      const addRow = (desc: string, amount: string, isTotal: boolean = false, isDeduction: boolean = false) => {
        const rowHeight = 22;
        if (isTotal) {
          doc.rect(40, tableY, 515, rowHeight).fill('#F3F4F6');
        } else {
          doc.rect(40, tableY, 515, rowHeight).fill('#FFFFFF');
        }
        doc.rect(40, tableY, 515, rowHeight).stroke(borderColor);

        const textColor = isTotal ? primaryColor : (isDeduction ? '#059669' : darkColor);
        const font = isTotal ? fontBold : fontRegular;

        doc.fontSize(9).fillColor(textColor).font(font).text(desc, 55, tableY + 6);
        doc.fontSize(9).fillColor(textColor).font(font).text(amount, 450, tableY + 6, { align: 'right' });
        tableY += rowHeight;
      };

      addRow('Base & Distance Fare', `${currencyPrefix}${data.fare.baseFare.toFixed(2)}`);

      if (data.fare.waitingCharges && data.fare.waitingCharges > 0) {
        addRow('Waiting Charges', `${currencyPrefix}${data.fare.waitingCharges.toFixed(2)}`);
      }

      if (data.fare.tipAmount && data.fare.tipAmount > 0) {
        addRow('Driver Tip', `${currencyPrefix}${data.fare.tipAmount.toFixed(2)}`);
      }

      if (data.fare.walletAmountUsed && data.fare.walletAmountUsed > 0) {
        addRow('Wallet Balance Applied', `- ${currencyPrefix}${data.fare.walletAmountUsed.toFixed(2)}`, false, true);
      }

      addRow('Total Amount Paid', `${currencyPrefix}${data.fare.totalFare.toFixed(2)}`, true);

      // ─── PAYMENT DETAILS BANNER ───────────────────────────────────
      tableY += 15;
      doc.roundedRect(40, tableY, 515, 52, 4).fill(cardBg);
      doc.roundedRect(40, tableY, 515, 52, 4).stroke(borderColor);

      doc.fontSize(8).fillColor(grayColor).font(fontBold).text('PAYMENT MODE', 55, tableY + 11);
      doc.fontSize(10).fillColor(darkColor).font(fontBold).text(data.fare.paymentMethod.toUpperCase(), 55, tableY + 26);

      doc.fontSize(8).fillColor(grayColor).font(fontBold).text('PAYMENT STATUS', 200, tableY + 11);
      doc.fontSize(10).fillColor('#059669').font(fontBold).text(data.fare.paymentStatus.toUpperCase(), 200, tableY + 26);

      if (data.fare.transactionId) {
        doc.fontSize(8).fillColor(grayColor).font(fontBold).text('TRANSACTION ID', 350, tableY + 11);
        doc.fontSize(9).fillColor(darkColor).font(fontRegular).text(data.fare.transactionId, 350, tableY + 26, { width: 190, ellipsis: true });
      }

      // ─── FOOTER & SUPPORT ─────────────────────────────────────────
      const footerY = 740;
      doc.rect(40, footerY - 15, 515, 1).fill(borderColor);

      doc.fontSize(8).fillColor(grayColor).font(fontRegular).text(
        'Thank you for riding with Woosh Mobility! For questions or issues regarding this ride, please reach out to us at support@woosh.co.in or via the in-app Help Center.',
        40,
        footerY,
        { width: 515, align: 'center' }
      );

      doc.fontSize(7).fillColor(lightGray).font(fontRegular).text(
        'Woosh Mobility Technologies Pvt. Ltd. • This is a computer-generated tax invoice and trip receipt.',
        40,
        footerY + 20,
        { width: 515, align: 'center' }
      );

      doc.end();
    });
  }

  /**
   * Helper to generate and save PDF file directly on server disk in uploads/invoices
   */
  public static async saveInvoiceFile(rideId: string, data: IInvoicePdfData): Promise<{ filePath: string; fileName: string; relativeUrl: string }> {
    const invoicesDir = path.join(process.cwd(), 'uploads/invoices');
    if (!fs.existsSync(invoicesDir)) {
      fs.mkdirSync(invoicesDir, { recursive: true });
    }

    const fileName = `invoice-${rideId}.pdf`;
    const filePath = path.join(invoicesDir, fileName);

    const pdfBuffer = await this.generateInvoiceBuffer(data);
    await fs.promises.writeFile(filePath, pdfBuffer);

    return {
      filePath,
      fileName,
      relativeUrl: `/uploads/invoices/${fileName}`,
    };
  }
}
