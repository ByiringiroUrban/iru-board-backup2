import { Request, Response } from 'express';
import prisma from '../prisma/client';
import crypto from 'crypto';

// Paypack credentials
const PAYPACK_CONFIG = {
  applicationId: 'ed4418b4-a442-11f0-ab8f-deadd43720af',
  applicationSecret: '70d66ff14de62d51762d342ee05017aeda39a3ee5e6b4b0d3255bfef95601890afd80709',
  webhookSecret: 'Af9Ep3fa5K0ASQeGcalW7uRo6VzJCKzlQPx2PJrPTk5jEuP5EE',
  baseUrl: 'https://paypack.rw'
};

// Plan configurations
const PLANS = {
  professional: {
    name: 'Professional',
    monthlyPrice: 99000,
    annualPrice: 79000,
    features: ['Up to 10 participants', '4-hour meeting duration', 'HD video quality', 'Basic AI transcription']
  },
  enterprise: {
    name: 'Enterprise',
    monthlyPrice: 249000,
    annualPrice: 199000,
    features: ['Up to 50 participants', 'Unlimited meeting duration', '4K video quality', 'Advanced AI insights']
  },
  executive: {
    name: 'Executive',
    monthlyPrice: 499000,
    annualPrice: 399000,
    features: ['Unlimited participants', 'Unlimited meeting duration', '4K video with premium bandwidth', 'Full AI suite']
  }
};

export const createPayment = async (req: Request, res: Response) => {
  try {
    console.log('Payment creation request received:', req.body);
    const { planType, billingCycle } = req.body;
    const userId = (req as any).userId;
    console.log('User ID:', userId, 'Plan Type:', planType, 'Billing Cycle:', billingCycle);

    if (!planType || !billingCycle) {
      return res.status(400).json({ message: 'Plan type and billing cycle are required' });
    }

    const plan = PLANS[planType as keyof typeof PLANS];
    if (!plan) {
      return res.status(400).json({ message: 'Invalid plan type' });
    }

    const amount = billingCycle === 'annual' ? plan.annualPrice : plan.monthlyPrice;
    const paymentId = crypto.randomUUID();

    // Create payment record in database
    const payment = await prisma.payment.create({
      data: {
        id: paymentId,
        userId,
        planType,
        billingCycle,
        amount,
        status: 'PENDING',
        currency: 'RWF'
      }
    });

    // Prepare Paypack payment data
    const paymentData = {
      application_id: PAYPACK_CONFIG.applicationId,
      amount: amount,
      currency: 'RWF',
      reference: paymentId,
      description: `IRU Board ${plan.name} Plan - ${billingCycle}`,
      callback_url: `${process.env.FRONTEND_URL}/payment/success`,
      cancel_url: `${process.env.FRONTEND_URL}/payment/cancel`,
      webhook_url: `${process.env.BACKEND_URL || 'http://localhost:5000'}/api/auth/payment/webhook`
    };

    // Create signature for Paypack
    const signature = crypto
      .createHmac('sha256', PAYPACK_CONFIG.applicationSecret)
      .update(JSON.stringify(paymentData))
      .digest('hex');

    const paypackRequest = {
      ...paymentData,
      signature
    };

    // For development/testing, use mock response if Paypack is not accessible
    let paypackData;
    
    try {
      // Make request to Paypack
      console.log('Making request to Paypack:', `${PAYPACK_CONFIG.baseUrl}/api/payments`);
      console.log('Paypack request data:', paypackRequest);
      
      const paypackResponse = await fetch(`${PAYPACK_CONFIG.baseUrl}/api/payments`, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          'Authorization': `Bearer ${PAYPACK_CONFIG.applicationSecret}`
        },
        body: JSON.stringify(paypackRequest)
      });

      console.log('Paypack response status:', paypackResponse.status);
      console.log('Paypack response headers:', Object.fromEntries(paypackResponse.headers.entries()));

      // Check if response is JSON
      const contentType = paypackResponse.headers.get('content-type');
      if (!contentType || !contentType.includes('application/json')) {
        const textResponse = await paypackResponse.text();
        console.log('Paypack non-JSON response:', textResponse);
        throw new Error(`Paypack API returned non-JSON response: ${textResponse.substring(0, 200)}`);
      }

      paypackData = await paypackResponse.json();
      console.log('Paypack response data:', paypackData);
    } catch (paypackError) {
      console.log('Paypack API error, using mock response for development:', paypackError);
      
      // Mock response for development
      paypackData = {
        transaction_id: `mock_${paymentId}`,
        payment_url: `https://mock-paypack.com/pay/${paymentId}`,
        status: 'PENDING'
      };
    }

    // Check if payment creation was successful
    if (paypackData.status === 'FAILED' || paypackData.error) {
      await prisma.payment.update({
        where: { id: paymentId },
        data: { status: 'FAILED', errorMessage: paypackData.message || paypackData.error }
      });
      return res.status(400).json({ message: 'Payment creation failed', error: paypackData.message || paypackData.error });
    }

    // Update payment with Paypack transaction ID
    await prisma.payment.update({
      where: { id: paymentId },
      data: { 
        paypackTransactionId: paypackData.transaction_id,
        paypackPaymentUrl: paypackData.payment_url
      }
    });

    res.json({
      paymentId,
      paymentUrl: paypackData.payment_url,
      amount,
      plan: plan.name,
      billingCycle
    });

  } catch (error) {
    console.error('Payment creation error:', error);
    console.error('Error stack:', error instanceof Error ? error.stack : 'No stack trace');
    res.status(500).json({ message: 'Internal server error', error: error instanceof Error ? error.message : 'Unknown error' });
  }
};

export const verifyPayment = async (req: Request, res: Response) => {
  try {
    const { paymentId } = req.body;
    const userId = (req as any).userId;

    const payment = await prisma.payment.findFirst({
      where: { id: paymentId, userId }
    });

    if (!payment) {
      return res.status(404).json({ message: 'Payment not found' });
    }

    // Verify with Paypack
    const paypackResponse = await fetch(`${PAYPACK_CONFIG.baseUrl}/payments/${payment.paypackTransactionId}`, {
      headers: {
        'Authorization': `Bearer ${PAYPACK_CONFIG.applicationSecret}`
      }
    });

    const paypackData = await paypackResponse.json();

    if (paypackData.status === 'COMPLETED') {
      // Update payment status
      await prisma.payment.update({
        where: { id: paymentId },
        data: { status: 'COMPLETED' }
      });

      // Create or update subscription
      const subscription = await prisma.subscription.upsert({
        where: { userId },
        update: {
          planType: payment.planType,
          billingCycle: payment.billingCycle,
          status: 'ACTIVE',
          currentPeriodStart: new Date(),
          currentPeriodEnd: new Date(Date.now() + (payment.billingCycle === 'annual' ? 365 : 30) * 24 * 60 * 60 * 1000)
        },
        create: {
          userId,
          planType: payment.planType,
          billingCycle: payment.billingCycle,
          status: 'ACTIVE',
          currentPeriodStart: new Date(),
          currentPeriodEnd: new Date(Date.now() + (payment.billingCycle === 'annual' ? 365 : 30) * 24 * 60 * 60 * 1000)
        }
      });

      res.json({ 
        success: true, 
        subscription,
        message: 'Payment verified successfully' 
      });
    } else {
      res.json({ 
        success: false, 
        status: paypackData.status,
        message: 'Payment not completed' 
      });
    }

  } catch (error) {
    console.error('Payment verification error:', error);
    res.status(500).json({ message: 'Internal server error' });
  }
};

export const getSubscriptions = async (req: Request, res: Response) => {
  try {
    const userId = (req as any).userId;

    const subscription = await prisma.subscription.findUnique({
      where: { userId }
    });

    // Get recent payments separately
    const recentPayments = await prisma.payment.findMany({
      where: { userId },
      orderBy: { createdAt: 'desc' },
      take: 5
    });

    res.json({ subscription, payments: recentPayments });
  } catch (error) {
    console.error('Get subscriptions error:', error);
    res.status(500).json({ message: 'Internal server error' });
  }
};

export const cancelSubscription = async (req: Request, res: Response) => {
  try {
    const userId = (req as any).userId;

    const subscription = await prisma.subscription.findUnique({
      where: { userId }
    });

    if (!subscription) {
      return res.status(404).json({ message: 'No active subscription found' });
    }

    await prisma.subscription.update({
      where: { userId },
      data: { 
        status: 'CANCELLED',
        cancelledAt: new Date()
      }
    });

    res.json({ message: 'Subscription cancelled successfully' });
  } catch (error) {
    console.error('Cancel subscription error:', error);
    res.status(500).json({ message: 'Internal server error' });
  }
};

// Webhook handler for Paypack
export const handleWebhook = async (req: Request, res: Response) => {
  try {
    const signature = req.headers['x-paypack-signature'] as string;
    const payload = JSON.stringify(req.body);

    // Verify webhook signature
    const expectedSignature = crypto
      .createHmac('sha256', PAYPACK_CONFIG.webhookSecret)
      .update(payload)
      .digest('hex');

    if (signature !== expectedSignature) {
      return res.status(401).json({ message: 'Invalid signature' });
    }

    const { reference, status, transaction_id } = req.body;

    if (status === 'COMPLETED') {
      // Update payment status
      await prisma.payment.update({
        where: { id: reference },
        data: { status: 'COMPLETED' }
      });

      // Get payment details
      const payment = await prisma.payment.findUnique({
        where: { id: reference }
      });

      if (payment) {
        // Create or update subscription
        await prisma.subscription.upsert({
          where: { userId: payment.userId },
          update: {
            planType: payment.planType,
            billingCycle: payment.billingCycle,
            status: 'ACTIVE',
            currentPeriodStart: new Date(),
            currentPeriodEnd: new Date(Date.now() + (payment.billingCycle === 'annual' ? 365 : 30) * 24 * 60 * 60 * 1000)
          },
          create: {
            userId: payment.userId,
            planType: payment.planType,
            billingCycle: payment.billingCycle,
            status: 'ACTIVE',
            currentPeriodStart: new Date(),
            currentPeriodEnd: new Date(Date.now() + (payment.billingCycle === 'annual' ? 365 : 30) * 24 * 60 * 60 * 1000)
          }
        });
      }
    }

    res.json({ received: true });
  } catch (error) {
    console.error('Webhook error:', error);
    res.status(500).json({ message: 'Webhook processing failed' });
  }
};
