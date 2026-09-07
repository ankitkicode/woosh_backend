import axios from 'axios';
import FormData from 'form-data';
import fs from 'fs';
import { ApiError } from '../utils/ApiError';

export class FaceService {
  /**
   * Calls Face++ Detect API to check if the uploaded face is female.
   * @param imagePath Path to the uploaded image file
   */
  static async verifyGender(imagePath: string): Promise<{ isFemale: boolean; message: string }> {
    const apiKey = process.env.FACEPP_API_KEY;
    const apiSecret = process.env.FACEPP_API_SECRET;

    if (!apiKey || !apiSecret) {
      throw new Error('Face++ credentials are not configured in .env');
    }

    try {
      const formData = new FormData();
      formData.append('api_key', apiKey);
      formData.append('api_secret', apiSecret);
      formData.append('image_file', fs.createReadStream(imagePath));
      formData.append('return_attributes', 'gender');

      const response = await axios.post('https://api-us.faceplusplus.com/facepp/v3/detect', formData, {
        headers: {
          ...formData.getHeaders(),
        },
      });

      const faces = response.data.faces;
      
      if (!faces || faces.length === 0) {
        throw new ApiError(400, 'No face detected in the image. Please try again.');
      }
      if (faces.length > 1) {
        throw new ApiError(400, 'Multiple faces detected. Please take a clear selfie of only yourself.');
      }

      const gender = faces[0].attributes?.gender?.value;
      if (!gender) {
        throw new ApiError(400, 'Could not determine gender from the photo.');
      }

      if (gender.toLowerCase() === 'female') {
        return { isFemale: true, message: 'Verification successful.' };
      } else {
        return { isFemale: false, message: 'Verification failed. This app is strictly for female passengers.' };
      }
    } catch (error: any) {
      if (error instanceof ApiError) throw error;
      
      console.error('Face++ API Error:', error.response?.data || error.message);
      throw new ApiError(500, 'Face verification service is currently unavailable.');
    }
  }
}
