'use client'

import { MantineProvider } from '@mantine/core';
import { Notifications } from '@mantine/notifications';

export default function Providers({ children }) {
  return (
    <MantineProvider>
      <Notifications position="top-right" autoClose={3000} containerWidth={320} limit={1} />
      {children}
    </MantineProvider>
  );
}
