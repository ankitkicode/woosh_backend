import fs from 'fs';
import path from 'path';
import { StatementPdfService, IStatementPdfData } from '../services/statementPdf.service';

async function generate() {
  const sampleData: IStatementPdfData = {
    monthLabel: 'Sep 2026',
    driver: {
      name: 'Pooja Verma',
      phoneNumber: '9876543210',
      vehicleNumber: 'MH12AB1234',
      city: 'Mumbai',
    },
    header: {
      netEarnings: 14850.00,
      rides: 85,
      hoursOnline: 154,
      daysActive: 25,
    },
    breakdown: {
      totalRideFares: 18562.50,
      paidOnline: 11200.00,
      cashCollected: 7362.50,
      tipsAndIncentives: 450.00,
      wooshCommission: 3712.50,
      commissionRatePercent: 20,
      paidToBank: 9500.00,
      cashDuesPaid: 1472.50,
      duesOutstanding: 0.00,
    },
    weeklyBreakdown: [
      { weekRange: '1–7 Sep', rides: 22, netEarnings: 3850.00 },
      { weekRange: '8–14 Sep', rides: 20, netEarnings: 3490.00 },
      { weekRange: '15–21 Sep', rides: 23, netEarnings: 4010.00 },
      { weekRange: '22–30 Sep', rides: 20, netEarnings: 3500.00 },
    ],
  };

  const buffer = await StatementPdfService.generateStatementBuffer(sampleData);
  
  const dest1 = path.join(process.cwd(), 'sample_monthly_statement_sep_2026.pdf');
  const dest2 = '/Users/ankitjatav/.gemini/antigravity-ide/brain/95d920ed-cc7b-4a6c-8a27-5a97305539f5/sample_monthly_statement_sep_2026.pdf';
  
  fs.writeFileSync(dest1, buffer);
  try {
    fs.writeFileSync(dest2, buffer);
  } catch(e) {}
  console.log('Sample PDF successfully created at:', dest1);
}

generate().catch(console.error);
