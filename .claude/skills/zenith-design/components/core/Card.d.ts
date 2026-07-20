import * as React from "react";

/**
 * Surface container: near-white surface, hairline border, 8px corner, soft
 * level-1 shadow. Restrained by design — no colored accent stripes, no
 * gradients.
 */
export interface CardProps extends React.HTMLAttributes<HTMLDivElement> {
  /** Add a pointer cursor + hover affordance for clickable cards. */
  interactive?: boolean;
  children?: React.ReactNode;
}

export function Card(props: CardProps): React.JSX.Element;
