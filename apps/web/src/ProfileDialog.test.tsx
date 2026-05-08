import { describe, expect, it, vi } from "vitest";
import { render, screen } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { ProfileDialog, TutorialDialog } from "./App.js";

describe("ProfileDialog", () => {
  it("submits display name and Steam friend code", async () => {
    const onSubmit = vi.fn();
    const user = userEvent.setup();

    render(<ProfileDialog onSubmit={onSubmit} />);

    await user.type(screen.getByLabelText("显示名"), "阿鲸");
    await user.type(screen.getByLabelText("Steam 好友码"), "123456");
    await user.click(screen.getByRole("button", { name: "保存" }));

    expect(onSubmit).toHaveBeenCalledWith({
      displayName: "阿鲸",
      steamFriendCode: "123456",
    });
  });
});

describe("TutorialDialog", () => {
  it("shows the lobby tutorial and closes on acknowledgement", async () => {
    const onClose = vi.fn();
    const user = userEvent.setup();

    render(<TutorialDialog onClose={onClose} />);

    expect(screen.getByRole("heading", { name: "快速使用教程" })).toBeInTheDocument();
    expect(screen.getByText(/左下角的房主按钮/)).toBeInTheDocument();

    await user.click(screen.getByRole("button", { name: "我知道了" }));

    expect(onClose).toHaveBeenCalledTimes(1);
  });
});
