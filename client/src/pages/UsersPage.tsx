import { NavBar } from '../components/NavBar'

export function UsersPage() {
  return (
    <>
      <NavBar />
      <section className="flex flex-1 flex-col items-center justify-center gap-6 p-8 text-center max-md:gap-4.5 max-md:px-5 max-md:py-8">
        <h1 className="my-8 text-[56px] leading-tight font-medium tracking-[-1.68px] text-gray-950 max-md:my-5 max-md:text-4xl">
          Users
        </h1>
      </section>
    </>
  )
}
