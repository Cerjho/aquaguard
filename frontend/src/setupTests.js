import '@testing-library/jest-dom';

jest.mock('@lottiefiles/dotlottie-react', () => ({
  DotLottieReact: () => <div data-testid="dotlottie-mock" />
}));

global.ResizeObserver = class ResizeObserver {
  observe() {}
  unobserve() {}
  disconnect() {}
};
