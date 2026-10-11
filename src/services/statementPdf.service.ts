import PDFDocument from 'pdfkit';
import fs from 'fs';
import path from 'path';

export interface IStatementPdfData {
  monthLabel: string;
  driver: {
    name: string;
    phoneNumber: string;
    vehicleNumber: string;
    city?: string;
  };
  header: {
    netEarnings: number;
    rides: number;
    hoursOnline: number;
    daysActive: number;
  };
  breakdown: {
    totalRideFares: number;
    paidOnline: number;
    cashCollected: number;
    tipsAndIncentives: number;
    wooshCommission: number;
    commissionRatePercent: number;
    paidToBank: number;
    cashDuesPaid: number;
    duesOutstanding: number;
  };
  weeklyBreakdown: Array<{
    weekRange: string;
    rides: number;
    netEarnings: number;
  }>;
}

export class StatementPdfService {
  /**
   * Generates a monthly statement PDF as a Buffer
   */
  public static async generateStatementBuffer(data: IStatementPdfData): Promise<Buffer> {
    return new Promise((resolve, reject) => {
      const doc = new PDFDocument({
        size: 'A4',
        margin: 40,
        info: {
          Title: `Woosh Monthly Statement - ${data.monthLabel}`,
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
        // Fallback if TTF fonts are missing: use Rs. to prevent WinAnsi ¹ corruption
        currencyPrefix = 'Rs. ';
      }

      const primaryColor = '#9C005B'; // Woosh Magenta
      const darkColor = '#111827';
      const grayColor = '#6B7280';
      const greenColor = '#059669';
      const redColor = '#DC2626';
      const tableBorderColor = '#E5E7EB';
      const tableRowBg = '#F9FAFB';

      // --- TOP BRAND ACCENT BAR ---
      doc.rect(40, 36, 515, 5).fill(primaryColor);

      // --- HEADER & LOGO ---
      const logoPath = path.join(__dirname, '../public/logo.png');
      const fallbackLogo = path.join(process.cwd(), 'src/public/logo.png');

      if (fs.existsSync(logoPath)) {
        doc.image(logoPath, 40, 48, { width: 130 });
      } else if (fs.existsSync(fallbackLogo)) {
        doc.image(fallbackLogo, 40, 48, { width: 130 });
      } else {
        doc.fontSize(22).fillColor(primaryColor).font(fontBold).text('WOOSH', 40, 52);
      }

      doc.fontSize(10).fillColor(grayColor).font(fontRegular).text('Driver Partner Monthly Statement', 40, 92);

      doc.fontSize(14).fillColor(darkColor).font(fontBold).text(data.monthLabel, 400, 52, { align: 'right' });
      doc.fontSize(9).fillColor(grayColor).font(fontRegular).text(`Generated: ${new Date().toLocaleDateString('en-IN')}`, 400, 72, { align: 'right' });

      // --- DRIVER INFO BOX ---
      const driverBoxY = 115;
      doc.rect(40, driverBoxY, 515, 56).fill('#F3F4F6');
      doc.rect(40, driverBoxY, 515, 56).stroke(tableBorderColor);

      doc.fontSize(8).fillColor(grayColor).font(fontBold).text('DRIVER PARTNER', 55, driverBoxY + 11);
      doc.fontSize(11).fillColor(darkColor).font(fontBold).text(data.driver.name || 'Partner', 55, driverBoxY + 25);

      doc.fontSize(8).fillColor(grayColor).font(fontBold).text('PHONE NUMBER', 195, driverBoxY + 11);
      doc.fontSize(11).fillColor(darkColor).font(fontBold).text(data.driver.phoneNumber, 195, driverBoxY + 25);

      doc.fontSize(8).fillColor(grayColor).font(fontBold).text('VEHICLE NUMBER', 335, driverBoxY + 11);
      doc.fontSize(11).fillColor(darkColor).font(fontBold).text(data.driver.vehicleNumber || 'N/A', 335, driverBoxY + 25);

      doc.fontSize(8).fillColor(grayColor).font(fontBold).text('CITY', 475, driverBoxY + 11);
      doc.fontSize(11).fillColor(darkColor).font(fontBold).text(data.driver.city || 'India', 475, driverBoxY + 25);

      // --- NET EARNINGS HIGHLIGHT BANNER ---
      const bannerY = 185;
      doc.rect(40, bannerY, 515, 65).fill(primaryColor);

      doc.fontSize(11).fillColor('#FFFFFF').font(fontRegular).text('Net Earnings', 55, bannerY + 12);
      doc.fontSize(24).fillColor('#FFFFFF').font(fontBold).text(`${currencyPrefix}${data.header.netEarnings.toFixed(2)}`, 55, bannerY + 28);

      const statsText = `${data.header.rides} rides  •  ${data.header.hoursOnline} hours online  •  ${data.header.daysActive} days active`;
      doc.fontSize(10).fillColor('#FCE7F3').font(fontRegular).text(statsText, 55, bannerY + 54);

      // --- STATEMENT BREAKDOWN TABLE ---
      let tableY = 265;
      doc.fontSize(12).fillColor(darkColor).font(fontBold).text('Earnings & Deductions Summary', 40, tableY);
      tableY += 18;

      // Header row
      doc.rect(40, tableY, 515, 22).fill('#E5E7EB');
      doc.fontSize(9).fillColor(darkColor).font(fontBold).text('DESCRIPTION', 55, tableY + 6);
      doc.fontSize(9).fillColor(darkColor).font(fontBold).text('AMOUNT', 460, tableY + 6, { align: 'right' });
      tableY += 22;

      const breakdownRows = [
        { label: 'Total ride fares', value: `${currencyPrefix}${data.breakdown.totalRideFares.toFixed(2)}`, color: darkColor },
        { label: '  • Paid online (UPI, card, wallet)', value: `${currencyPrefix}${data.breakdown.paidOnline.toFixed(2)}`, color: grayColor },
        { label: '  • Cash you collected', value: `${currencyPrefix}${data.breakdown.cashCollected.toFixed(2)}`, color: grayColor },
        { label: 'Tips & incentives', value: `+${currencyPrefix}${data.breakdown.tipsAndIncentives.toFixed(2)}`, color: greenColor },
        { label: `Woosh commission (${data.breakdown.commissionRatePercent}%)`, value: `-${currencyPrefix}${data.breakdown.wooshCommission.toFixed(2)}`, color: redColor },
        { label: 'Paid to your bank', value: `${currencyPrefix}${data.breakdown.paidToBank.toFixed(2)}`, color: darkColor },
        { label: 'Cash dues paid to Woosh', value: `${currencyPrefix}${data.breakdown.cashDuesPaid.toFixed(2)}`, color: darkColor },
        { label: 'Dues outstanding', value: `${currencyPrefix}${data.breakdown.duesOutstanding.toFixed(2)}`, color: data.breakdown.duesOutstanding > 0 ? redColor : darkColor, bold: true },
      ];

      breakdownRows.forEach((row, index) => {
        if (index % 2 === 0) {
          doc.rect(40, tableY, 515, 20).fill(tableRowBg);
        }
        doc.rect(40, tableY, 515, 20).stroke(tableBorderColor);

        doc.fontSize(9)
          .fillColor(row.color)
          .font(row.bold ? fontBold : fontRegular)
          .text(row.label, 55, tableY + 5);

        doc.fontSize(9)
          .fillColor(row.color)
          .font(row.bold ? fontBold : fontRegular)
          .text(row.value, 460, tableY + 5, { align: 'right' });

        tableY += 20;
      });

      tableY += 15;

      // --- WEEKLY BREAKDOWN TABLE ---
      doc.fontSize(12).fillColor(darkColor).font(fontBold).text('Weekly Breakdown', 40, tableY);
      tableY += 18;

      // Header row
      doc.rect(40, tableY, 515, 22).fill('#E5E7EB');
      doc.fontSize(9).fillColor(darkColor).font(fontBold).text('WEEK', 55, tableY + 6);
      doc.fontSize(9).fillColor(darkColor).font(fontBold).text('RIDES', 270, tableY + 6);
      doc.fontSize(9).fillColor(darkColor).font(fontBold).text('NET EARNINGS', 460, tableY + 6, { align: 'right' });
      tableY += 22;

      data.weeklyBreakdown.forEach((week, index) => {
        if (index % 2 === 0) {
          doc.rect(40, tableY, 515, 22).fill(tableRowBg);
        }
        doc.rect(40, tableY, 515, 22).stroke(tableBorderColor);

        doc.fontSize(9).fillColor(darkColor).font(fontRegular).text(week.weekRange, 55, tableY + 5);
        doc.fontSize(9).fillColor(darkColor).font(fontRegular).text(String(week.rides), 270, tableY + 5);
        doc.fontSize(9).fillColor(darkColor).font(fontBold).text(`${currencyPrefix}${week.netEarnings.toFixed(2)}`, 460, tableY + 5, { align: 'right' });

        tableY += 20;
      });

      // --- FOOTER NOTE ---
      const footerY = 745;
      doc.rect(40, footerY, 515, 1).fill(tableBorderColor);

      doc.fontSize(8).fillColor(grayColor).font(fontRegular)
        .text('This is a computer-generated monthly statement from Woosh Platform and does not require a physical signature.', 40, footerY + 10, { align: 'center', width: 515 });
      doc.fontSize(8).fillColor(grayColor).font(fontRegular)
        .text('Need help with your statement? Contact driver support in the Woosh Partner App or email support@woosh.com', 40, footerY + 22, { align: 'center', width: 515 });

      doc.end();
    });
  }
}
