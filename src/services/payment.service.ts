import Razorpay from 'razorpay';
import crypto from 'crypto';

// Plug-and-play Razorpay integration
const RAZORPAY_KEY_ID = process.env.RAZORPAY_KEY_ID || '';
const RAZORPAY_KEY_SECRET = process.env.RAZORPAY_KEY_SECRET || '';

let razorpay: Razorpay;
const getRazorpayInstance = () => {
  if (!razorpay) {
    if (!RAZORPAY_KEY_ID || !RAZORPAY_KEY_SECRET) {
      throw new Error('Razorpay keys are not configured in .env');
    }
    razorpay = new Razorpay({
      key_id: RAZORPAY_KEY_ID,
      key_secret: RAZORPAY_KEY_SECRET,
    });
  }
  return razorpay;
};

export const paymentService = {
  /**
   * Creates a Razorpay Order
   * @param amount Amount in INR
   * @param receipt Unique receipt id
   * @returns Razorpay order details
   */
  async createOrder(amount: number, receipt: string) {
    // Razorpay works in paise (amount * 100)
    const options = {
      amount: amount * 100,
      currency: 'INR',
      receipt,
    };

    const rzp = getRazorpayInstance();
    return await rzp.orders.create(options);
  },

  /**
   * Verifies the Razorpay payment signature
   */
  verifyPaymentSignature(orderId: string, paymentId: string, signature: string): boolean {
    if (!RAZORPAY_KEY_SECRET) {
      throw new Error('Razorpay keys are not configured in .env');
    }

    const body = orderId + '|' + paymentId;
    const expectedSignature = crypto
      .createHmac('sha256', RAZORPAY_KEY_SECRET)
      .update(body.toString())
      .digest('hex');

    return expectedSignature === signature;
  },
};
