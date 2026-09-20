import * as React from "react"
import { Button, type ButtonProps } from "@/components/ui/button"
import { cn } from "@/lib/utils"

/**
 * Shared pill tab set from PR 79. One muted track, a raised card pill for
 * the selected tab.
 */
export function tabTriggerClass(selected: boolean) {
  return cn(
    "px-2 sm:px-3",
    selected
      ? "bg-card text-foreground shadow-sm hover:bg-card hover:text-foreground"
      : "text-muted-foreground hover:bg-card/70 hover:text-foreground",
  )
}

export function TabsList({
  className,
  ...props
}: React.HTMLAttributes<HTMLDivElement>) {
  return (
    <div
      role="tablist"
      className={cn("inline-flex h-8 items-center rounded-lg bg-muted p-0.5", className)}
      {...props}
    />
  )
}

type TabsTriggerProps = Omit<ButtonProps, "variant" | "size" | "asChild"> & {
  selected: boolean
}

export function TabsTrigger({
  selected,
  className,
  type = "button",
  ...props
}: TabsTriggerProps) {
  return (
    <Button
      type={type}
      role="tab"
      aria-selected={selected}
      variant="ghost"
      size="pill"
      data-state={selected ? "active" : "inactive"}
      className={cn(tabTriggerClass(selected), className)}
      {...props}
    />
  )
}
