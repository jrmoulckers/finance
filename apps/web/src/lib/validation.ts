import { z } from 'zod';

export const transactionSchema = z.object({
  description: z.string().min(1, 'Description is required'),
  amount: z.number().positive('Amount must be positive'),
  type: z.enum(['EXPENSE', 'INCOME', 'TRANSFER']),
  categoryId: z.string().min(1, 'Category is required'),
  accountId: z.string().min(1, 'Account is required'),
  date: z.string().min(1, 'Date is required'),
  notes: z.string().optional(),
});

export const accountSchema = z.object({
  name: z.string().min(1, 'Name is required'),
  type: z.enum(['CHECKING', 'SAVINGS', 'CREDIT_CARD', 'CASH', 'INVESTMENT', 'LOAN', 'OTHER']),
  currencyCode: z.string().min(3).max(3),
  initialBalance: z.number().min(0),
});

export const budgetSchema = z.object({
  categoryId: z.string().min(1, 'Category is required'),
  amount: z.number().positive('Amount must be positive'),
  period: z.enum(['WEEKLY', 'BIWEEKLY', 'MONTHLY', 'QUARTERLY', 'YEARLY']),
});

export const goalSchema = z.object({
  name: z.string().min(1, 'Name is required'),
  targetAmount: z.number().positive('Target amount must be positive'),
  currentAmount: z.number().min(0).optional(),
  targetDate: z.string().optional(),
  description: z.string().optional(),
});

export const loginSchema = z.object({
  email: z.string().email('Valid email required'),
  password: z.string().min(8, 'Password must be at least 8 characters'),
});

export const signupSchema = loginSchema
  .extend({
    confirmPassword: z.string(),
  })
  .refine((d) => d.password === d.confirmPassword, {
    message: 'Passwords must match',
    path: ['confirmPassword'],
  });
