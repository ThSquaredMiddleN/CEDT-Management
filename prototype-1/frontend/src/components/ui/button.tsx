import { Slot } from "@radix-ui/react-slot";
import { cva, type VariantProps } from "class-variance-authority";
import * as React from "react";
import { cn } from "@/lib/utils";

const buttonVariants = cva(
  "inline-flex items-center justify-center gap-2 whitespace-nowrap rounded-md text-sm font-medium transition-colors focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-neutral-950 focus-visible:ring-offset-2 disabled:pointer-events-none disabled:opacity-50",
  {
    variants: {
      variant: {
        default: "bg-neutral-900 text-neutral-50 hover:bg-neutral-800",
        outline: "border border-neutral-200 bg-white hover:bg-neutral-100 text-neutral-950",
        secondary: "bg-neutral-100 text-neutral-900 hover:bg-neutral-200",
        ghost: "hover:bg-neutral-100 text-neutral-950",
        link: "text-neutral-950 underline underline-offset-4 hover:text-neutral-700",
        filled:
          "rounded-lg border border-transparent bg-brand-primary font-body text-white shadow-light-6 hover:bg-button-primary-hover active:border-button-primary-pressed-border active:bg-button-primary-pressed disabled:bg-button-primary-disabled-background disabled:text-button-primary-disabled-foreground disabled:opacity-100 disabled:shadow-none",
        outlined:
          "rounded-lg border border-brand-primary bg-transparent font-body text-brand-primary shadow-light-6 hover:border-button-primary-hover hover:text-button-primary-hover active:border-button-primary-pressed active:text-button-primary-pressed disabled:border-button-primary-disabled-foreground disabled:text-button-primary-disabled-foreground disabled:opacity-100 disabled:shadow-none",
        "ghost-primary":
          "rounded-lg border border-transparent bg-transparent font-body text-brand-primary shadow-none hover:text-button-primary-hover active:text-button-primary-pressed disabled:text-button-primary-disabled-foreground disabled:opacity-100",
      },
      size: {
        default: "h-9 px-4 py-2",
        sm: "h-8 rounded-md px-3 text-xs",
        lg: "h-10 rounded-md px-8",
        icon: "size-9",
        "icon-sm": "size-8",
        large: "h-[51px] px-[62px] py-4",
        medium: "h-[41px] px-[57px] py-3",
        small: "h-[30px] px-[49px] py-2",
      },
    },
    defaultVariants: { variant: "default", size: "default" },
  },
);

export interface ButtonProps
  extends React.ButtonHTMLAttributes<HTMLButtonElement>,
    VariantProps<typeof buttonVariants> {
  asChild?: boolean;
  icon?: React.ReactNode;
  iconPosition?: "start" | "end";
  loading?: boolean;
}

export const Button = React.forwardRef<HTMLButtonElement, ButtonProps>(
  (
    {
      children,
      className,
      variant,
      size,
      asChild = false,
      icon,
      iconPosition = "end",
      loading = false,
      disabled = false,
      tabIndex,
      "aria-disabled": ariaDisabled,
      "aria-busy": ariaBusy,
      onClick,
      ...props
    },
    ref,
  ) => {
    const Comp = asChild ? Slot : "button";
    const isFigmaVariant =
      variant === "filled" || variant === "outlined" || variant === "ghost-primary";
    const iconPadding =
      isFigmaVariant && icon
        ? size === "large"
          ? "px-[52px]"
          : size === "medium"
            ? "px-[47px]"
            : size === "small"
              ? "px-[39px]"
              : undefined
        : undefined;
    const figmaTypography = isFigmaVariant
      ? size === "medium"
        ? "text-body-sm-emphasize"
        : size === "small"
          ? "text-body-xs-emphasize"
          : size === "large" || size === "default"
            ? "text-body-md-emphasize"
            : undefined
      : undefined;
    const iconSize =
      size === "small" ? "size-3" : size === "medium" ? "size-[14px]" : "size-4";
    const isDisabled = disabled || loading;
    const content = loading ? (
      <>
        <span className="sr-only">{children}</span>
        <span className="flex items-center gap-1.5" aria-hidden="true">
          <span className="size-2 rounded-full bg-current" />
          <span className="size-3 rounded-full border-2 border-current bg-transparent" />
          <span className="size-2 rounded-full bg-current" />
        </span>
      </>
    ) : (
      <>
        {icon && iconPosition === "start" && (
          <span className={cn("shrink-0 [&>svg]:size-full", iconSize)} aria-hidden="true">
            {icon}
          </span>
        )}
        {children}
        {icon && iconPosition === "end" && (
          <span className={cn("shrink-0 [&>svg]:size-full", iconSize)} aria-hidden="true">
            {icon}
          </span>
        )}
      </>
    );
    let renderedChildren: React.ReactNode = content;
    if (asChild) {
      if (!icon && !loading) {
        renderedChildren = children;
      } else if (React.isValidElement(children)) {
        renderedChildren = React.cloneElement(children, undefined, content);
      } else {
        throw new Error("Button with asChild, icon, or loading requires a single React element child.");
      }
    }

    const handleClick: React.MouseEventHandler<HTMLButtonElement> = (event) => {
      if (asChild && isDisabled) {
        event.preventDefault();
        event.stopPropagation();
        return;
      }
      onClick?.(event);
    };

    return (
      <Comp
        className={cn(
          buttonVariants({ variant, size }),
          isFigmaVariant && "gap-1.5",
          figmaTypography,
          iconPadding,
          asChild && isDisabled && "pointer-events-none",
          className,
        )}
        ref={ref}
        disabled={asChild ? undefined : isDisabled}
        aria-disabled={asChild && isDisabled ? true : ariaDisabled}
        aria-busy={loading || ariaBusy}
        tabIndex={asChild && isDisabled ? -1 : tabIndex}
        onClick={handleClick}
        {...props}
      >
        {renderedChildren}
      </Comp>
    );
  },
);
Button.displayName = "Button";

export { buttonVariants };
