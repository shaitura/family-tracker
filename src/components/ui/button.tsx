import * as React from 'react';
import { Slot } from '@radix-ui/react-slot';
import { cva, type VariantProps } from 'class-variance-authority';
import { cn } from '@/lib/utils';

const buttonVariants = cva(
  'inline-flex items-center justify-center gap-2 whitespace-nowrap rounded-2xl text-sm font-medium transition-all duration-200 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring disabled:pointer-events-none disabled:opacity-50',
  {
    variants: {
      variant: {
        default: 'bg-gradient-to-r from-cyan-500 to-purple-500 text-white hover:from-cyan-400 hover:to-purple-400 shadow-lg hover:shadow-cyan-500/25',
        destructive: 'bg-destructive text-destructive-foreground hover:bg-destructive/90',
        outline: 'border border-white/20 bg-white/5 hover:bg-white/10 text-white backdrop-blur-sm',
        secondary: 'bg-white/10 text-white hover:bg-white/20',
        ghost: 'hover:bg-white/10 text-white/70 hover:text-white',
        link: 'text-cyan-400 underline-offset-4 hover:underline',
        gradient: 'bg-gradient-to-r from-pink-500 to-purple-500 text-white hover:opacity-90 shadow-lg',
        success: 'bg-gradient-to-r from-emerald-500 to-teal-500 text-white hover:opacity-90',
      },
      size: {
        default: 'h-10 px-5 py-2',
        sm: 'h-8 rounded-xl px-3 text-xs',
        lg: 'h-12 rounded-2xl px-8 text-base',
        xl: 'h-14 rounded-2xl px-10 text-base font-semibold',
        icon: 'h-10 w-10',
      },
    },
    defaultVariants: { variant: 'default', size: 'default' },
  },
);

export interface ButtonProps
  extends React.ButtonHTMLAttributes<HTMLButtonElement>,
    VariantProps<typeof buttonVariants> {
  asChild?: boolean;
}

const Button = React.forwardRef<HTMLButtonElement, ButtonProps>(
  ({ className, variant, size, asChild = false, ...props }, ref) => {
    const Comp = asChild ? Slot : 'button';
    return <Comp className={cn(buttonVariants({ variant, size, className }))} ref={ref} {...props} />;
  },
);
Button.displayName = 'Button';

export { Button, buttonVariants };
