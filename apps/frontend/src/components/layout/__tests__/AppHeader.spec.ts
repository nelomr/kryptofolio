import { describe, it, expect, vi } from "vitest";
import { mount } from "@vue/test-utils";
import AppHeader from "../AppHeader.vue";
import { en } from "@/i18n/dictionaries/en";

vi.mock("@/composables/useI18n", () => ({
  useI18n: () => ({
    t: (key: keyof typeof en) => en[key] || key,
  }),
}));

describe("AppHeader", () => {
  const createWrapper = () => {
    return mount(AppHeader, {
      global: {
        stubs: {
          RouterLink: {
            props: ["to", "exactActiveClass", "activeClass", "title"],
            template: `<a :href="to" :data-to="to" :title="title" class="router-link"><slot /></a>`,
          },
        },
      },
    });
  };

  it("renders with a 56px height (h-14) and sticky container", () => {
    const wrapper = createWrapper();
    const header = wrapper.find("header");
    expect(header.classes()).toContain("sticky");
    expect(header.classes()).toContain("top-0");
    expect(header.classes()).toContain("border-border-soft");

    const innerBar = header.find(".h-14");
    expect(innerBar.exists()).toBe(true);
    expect(innerBar.classes()).toContain("flex");
    expect(innerBar.classes()).toContain("items-center");
  });

  it("renders the geometric dragon logo with alt='Kryptofolio'", () => {
    const wrapper = createWrapper();
    const logoImg = wrapper.find("img");
    expect(logoImg.exists()).toBe(true);
    expect(logoImg.attributes("alt")).toBe("Kryptofolio");
    expect(logoImg.classes()).toContain("h-7");
    expect(logoImg.classes()).toContain("w-7");
  });

  it("renders high-contrast Inter brand typography without subtitle tags", () => {
    const wrapper = createWrapper();
    const brandText = wrapper.find("span.font-sans");
    expect(brandText.exists()).toBe(true);
    expect(brandText.text()).toBe("Kryptofolio");
    expect(brandText.classes()).toContain("font-semibold");
    expect(brandText.classes()).toContain("text-[15px]");

    // Monospace brand title and subtitle must not exist
    expect(wrapper.find(".font-mono").exists()).toBe(false);
    expect(wrapper.text()).not.toContain("portfolio.subtitle");
  });

  it("renders navigation links for Portfolio and Tax Report", () => {
    const wrapper = createWrapper();
    const nav = wrapper.find("nav");
    expect(nav.exists()).toBe(true);

    const portfolioLink = nav.find('a[data-to="/"]');
    expect(portfolioLink.exists()).toBe(true);
    expect(portfolioLink.text()).toContain(en["navbar.portfolio"]);

    const taxLink = nav.find('a[data-to="/tax"]');
    expect(taxLink.exists()).toBe(true);
    expect(taxLink.text()).toContain(en["tax.title"]);
  });

  it("renders the decoupled settings action in the utility zone", () => {
    const wrapper = createWrapper();
    const settingsLink = wrapper.find('a[data-to="/settings"]');
    expect(settingsLink.exists()).toBe(true);
    expect(settingsLink.attributes("title")).toBe(en["navbar.settings"]);
    expect(settingsLink.classes()).toContain("h-8");
    expect(settingsLink.classes()).toContain("w-8");
  });
});
