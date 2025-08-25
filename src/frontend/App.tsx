import { Toaster } from "@/components/ui/toaster"
import { HomePage } from "./pages/HomePage"

function App() {
  return (
    <>
      <main className="container mx-auto p-4">
        <header className="mb-8">
          <h1 className="text-3xl font-bold text-sky-600 tracking-tight">
            Image Labeling Tool
          </h1>
          <p className="text-muted-foreground">
            A lightweight tool for image annotation.
          </p>
        </header>

        <HomePage />

      </main>
      <Toaster />
    </>
  )
}

export default App
