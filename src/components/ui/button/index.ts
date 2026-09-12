import type { VariantProps } from 'class-variance-authority'
import { cva } from 'class-variance-authority'

export { default as Button } from './Button.vue'

const pop = [
  'border-x-2 border-t-2 border-b-4',
  'shadow-[inset_0_1px_0_oklch(1_0_0/0.22)]',
  'active:border-b-2 active:scale-y-[0.96]',
].join(' ')

export const buttonVariants = cva(
  [
    'group/button inline-flex shrink-0 items-center justify-center whitespace-nowrap',
    'rounded-xl text-sm font-medium',
    'origin-bottom cursor-pointer select-none outline-none',
    'transition-[transform,border-width,background-color,filter,box-shadow,color] duration-150 ease-out',
    'focus-visible:border-ring focus-visible:ring-ring/50 focus-visible:ring-3',
    'aria-invalid:ring-destructive/20 aria-invalid:border-destructive aria-invalid:ring-3',
    'disabled:pointer-events-none disabled:opacity-50 disabled:shadow-none disabled:active:scale-y-100',
    '[&_svg]:pointer-events-none [&_svg]:shrink-0 [&_svg:not([class*=size-])]:size-4',
  ].join(' '),
  {
    variants: {
      variant: {
        default: [
          pop,
          'border-btn-edge bg-primary font-semibold text-primary-foreground',
          'hover:brightness-105 active:brightness-95',
        ].join(' '),
        outline: [
          pop,
          'border-btn-edge-muted bg-card text-foreground',
          'hover:bg-muted active:bg-muted',
        ].join(' '),
        secondary: [
          pop,
          'border-btn-edge-muted bg-secondary text-secondary-foreground',
          'hover:bg-accent active:bg-accent',
        ].join(' '),
        ghost: [
          'border border-transparent bg-transparent',
          'hover:bg-muted hover:text-foreground',
          'active:scale-[0.97] active:bg-muted',
        ].join(' '),
        destructive: [
          pop,
          'border-btn-edge-destructive bg-destructive/18 font-semibold text-destructive',
          'hover:bg-destructive/28 active:bg-destructive/28',
        ].join(' '),
        link: 'border-transparent bg-transparent text-primary underline-offset-4 hover:underline active:scale-[0.98]',
      },
      size: {
        'default': 'h-11 min-h-11 gap-2 px-4 has-data-[icon=inline-end]:pr-3.5 has-data-[icon=inline-start]:pl-3.5',
        'xs': 'h-8 min-h-8 gap-1 rounded-lg px-2.5 text-xs has-data-[icon=inline-end]:pr-2 has-data-[icon=inline-start]:pl-2 [&_svg:not([class*=size-])]:size-3',
        'sm': 'h-9 min-h-9 gap-1.5 px-3 text-[0.8125rem] has-data-[icon=inline-end]:pr-2.5 has-data-[icon=inline-start]:pl-2.5 [&_svg:not([class*=size-])]:size-3.5',
        'lg': 'h-14 min-h-14 gap-2 px-6 text-base has-data-[icon=inline-end]:pr-5 has-data-[icon=inline-start]:pl-5 [&_svg:not([class*=size-])]:size-5',
        'icon': 'size-11',
        'icon-xs': 'size-8 rounded-lg [&_svg:not([class*=size-])]:size-3',
        'icon-sm': 'size-9 [&_svg:not([class*=size-])]:size-4',
        'icon-lg': 'size-12 [&_svg:not([class*=size-])]:size-5',
      },
    },
    defaultVariants: {
      variant: 'default',
      size: 'default',
    },
  },
)
export type ButtonVariants = VariantProps<typeof buttonVariants>
