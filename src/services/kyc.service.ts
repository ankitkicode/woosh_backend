import axios from 'axios';

const KYC_PROVIDER_URL = process.env.KYC_PROVIDER_URL || '';
const KYC_API_KEY = process.env.KYC_API_KEY || '';

export const kycService = {
  /**
   * Verify Aadhaar Number
   */
  async verifyAadhaar(aadhaarNumber: string): Promise<boolean> {
    if (!KYC_PROVIDER_URL || !KYC_API_KEY) {
      throw new Error('KYC provider credentials are not configured in .env');
    }

    try {
      const response = await axios.post(
        `${KYC_PROVIDER_URL}/aadhaar/verify`,
        { aadhaar_number: aadhaarNumber },
        { headers: { Authorization: `Bearer ${KYC_API_KEY}` } }
      );
      return response.data.status === 'success';
    } catch (error) {
      console.error('Error verifying Aadhaar:', error);
      return false;
    }
  },

  /**
   * Face Match (Compare selfie with Aadhaar/DL photo)
   */
  async verifyFaceMatch(selfieUrl: string, documentPhotoUrl: string): Promise<boolean> {
    if (!KYC_PROVIDER_URL || !KYC_API_KEY) {
      throw new Error('KYC provider credentials are not configured in .env');
    }

    try {
      const response = await axios.post(
        `${KYC_PROVIDER_URL}/face/match`,
        { image1: selfieUrl, image2: documentPhotoUrl },
        { headers: { Authorization: `Bearer ${KYC_API_KEY}` } }
      );
      // Assuming API returns match_percentage
      return response.data.match_percentage > 85;
    } catch (error) {
      console.error('Error verifying Face Match:', error);
      return false;
    }
  },
};
