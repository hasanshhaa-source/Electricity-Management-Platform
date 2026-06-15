'use client';

import * as React from 'react';
import Link from 'next/link';
import { cva, type VariantProps } from 'class-variance-authority';
import { cn } from '@/lib/utils/cn';

const buttonVariants = cva(
  'inline-flex items-center justify-center gap-2 whitespace-nowrap rounded-md text-sm font-medium transition-colors focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring disabled:pointer-events-none disabled:opacity-50',
  {
    variants: {
      variant: {
        default:     'bg-blue-600 text-white hover:bg-blue-700 focus-visible:ring-blue-600',
        destructive: 'bg-red-600 text-white hover:bg-red-700 focus-visible:ring-red-600',
        outline:     'border border-gray-300 bg-white text-gray-700 hover:bg-gray-50',
        secondary:   'bg-gray-100 text-gray-900 hover:bg-gray-200',
        ghost:       'text-gray-700 hover:bg-gray-100',
        link:        'text-blue-600 underline-offset-4 hover:underline',
        success:     'bg-green-600 text-white hover:bg-green-700',
        warning:     'bg-amber-500 text-white hover:bg-amber-600',
      },
      size: {
        default: 'h-10 px-4 py-2',
        sm:      'h-8 rounded-md px-3 text-xs',
        lg:      'h-11 rounded-md px-8',
        icon:    'h-10 w-10',
      },
    },
    defaultVariants: {
      variant: 'default',
      size:    'default',
    },
  }
);

export interface ButtonProps
  extends React.ButtonHTMLAttributes<HTMLButtonElement>,
    VariantProps<typeof buttonVariants> {
  asChild?: boolean;
  loading?: boolean;
  href?: string;
}

const Spinner = () => (
  <svg className="h-4 w-4 animate-spin" viewBox="0 0 24 24" fill="none">
    <circle className="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" strokeWidth="4" />
    <path className="opacity-75" fill="currentColor" d="M4 12a8 8 0 018-8V0C5.373 0 0 5.373 0 12h4z" />
  </svg>
);

const Button = React.forwardRef<HTMLButtonElement, ButtonProps>(
  ({ className, variant, size, asChild: _asChild, loading, children, disabled, href, ...props }, ref) => {
    const classes = cn(buttonVariants({ variant, size, className }));

    // If href is provided, render as Next.js Link
    if (href) {
      return (
        <Link href={href} className={classes}>
          {children}
        </Link>
      );
    }

    // If asChild was used with a single Link child, extract the href and render as Link
    if (_asChild && React.isValidElement(children)) {
      const child = children as React.ReactElement<{ href?: string; children?: React.ReactNode }>;
      if (child.props.href) {
        return (
          <Link href={child.props.href} className={classes}>
            {child.props.children}
          </Link>
        );
      }
    }

    return (
      <button
        className={classes}
        ref={ref}
        disabled={disabled || loading}
        {...props}
      >
        {loading && <Spinner />}
        {children}
      </button>
    );
  }
);
Button.displayName = 'Button';

export { Button, buttonVariants };
