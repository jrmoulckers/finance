import type { Meta, StoryObj } from '@storybook/react';
import { CurrencyDisplay } from '../common/CurrencyDisplay';

const meta: Meta<typeof CurrencyDisplay> = {
  title: 'Common/CurrencyDisplay', component: CurrencyDisplay, tags: ['autodocs'],
  argTypes: { amount: { control: 'number' }, currency: { control: 'text' }, locale: { control: 'text' } },
};
export default meta;
type Story = StoryObj<typeof CurrencyDisplay>;

export const Positive: Story = { args: { amount: 1234.56, currency: 'USD' } };
export const Negative: Story = { args: { amount: -789.00, currency: 'USD' } };
export const Zero: Story = { args: { amount: 0, currency: 'USD' } };
export const Colorized: Story = { args: { amount: 500, currency: 'USD', colorize: true, showSign: true } };
export const EuroCurrency: Story = { args: { amount: 1234.56, currency: 'EUR', locale: 'de-DE' } };
export const JapaneseYen: Story = { args: { amount: 150000, currency: 'JPY', locale: 'ja-JP' } };