import { fireEvent, render, screen } from "@testing-library/react";
import { describe, expect, test } from "vitest";
import { OnboardingChecklist } from "./OnboardingChecklist";
// Side-effect: initializes i18next so `t()` renders real copy instead of
// raw keys (see CardMenu.test.tsx for the first owned component to do this).
import "../i18n";

const noop = () => {};

describe("OnboardingChecklist", () => {
  test("renders the title and the three checklist steps", () => {
    render(
      <OnboardingChecklist
        profileDone={false}
        companyDone={false}
        jobDone={false}
        onGoToProfile={noop}
        onGoToCompanies={noop}
        onAddJob={noop}
        onDismiss={noop}
        onLoadSample={noop}
      />,
    );
    expect(
      screen.getByRole("heading", { name: "Getting started" }),
    ).toBeInTheDocument();
    expect(
      screen.getByRole("button", { name: "Fill out your CV profile basics" }),
    ).toBeInTheDocument();
    expect(
      screen.getByRole("button", { name: "Add your first company" }),
    ).toBeInTheDocument();
    expect(
      screen.getByRole("button", { name: "Add your first job" }),
    ).toBeInTheDocument();
  });

  test("the dismiss button calls onDismiss", () => {
    let dismissed = false;
    render(
      <OnboardingChecklist
        profileDone={false}
        companyDone={false}
        jobDone={false}
        onGoToProfile={noop}
        onGoToCompanies={noop}
        onAddJob={noop}
        onDismiss={() => {
          dismissed = true;
        }}
        onLoadSample={noop}
      />,
    );
    fireEvent.click(screen.getByRole("button", { name: "Close" }));
    expect(dismissed).toBe(true);
  });

  test("hides the sample-data link once a job has been added", () => {
    render(
      <OnboardingChecklist
        profileDone={true}
        companyDone={true}
        jobDone={true}
        onGoToProfile={noop}
        onGoToCompanies={noop}
        onAddJob={noop}
        onDismiss={noop}
        onLoadSample={noop}
      />,
    );
    expect(
      screen.queryByText("Prefer to explore first? Load sample data"),
    ).not.toBeInTheDocument();
  });

  test("emits zui-onboarding classes, never the legacy onboarding name", () => {
    const { container } = render(
      <OnboardingChecklist
        profileDone={false}
        companyDone={false}
        jobDone={false}
        onGoToProfile={noop}
        onGoToCompanies={noop}
        onAddJob={noop}
        onDismiss={noop}
        onLoadSample={noop}
      />,
    );
    const root = container.firstElementChild;
    expect(root).toHaveClass("zui-onboarding");
    expect(root?.className).not.toMatch(/(^|\s)onboarding(\s|$)/);

    const dismissBtn = screen.getByRole("button", { name: "Close" });
    expect(dismissBtn).toHaveClass("zui-onboarding-dismiss");
    expect(dismissBtn.className).not.toMatch(/(^|\s)onboarding-dismiss(\s|$)/);

    const sampleLink = screen.getByText(
      "Prefer to explore first? Load sample data",
    );
    expect(sampleLink).toHaveClass("zui-onboarding-sample");
    expect(sampleLink.className).not.toMatch(
      /(^|\s)onboarding-sample(\s|$)/,
    );
  });
});
