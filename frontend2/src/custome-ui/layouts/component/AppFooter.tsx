
function AppFooter() {
    return (
        <footer>
            <div
                className={
                    "relative flex w-full bottom-0 bg-[#1E4BC6] justify-center items-center p-3"
                }
            >
                <span className={"text-white"}>
                    Find, validate and extract lease provisions to Microsoft Word and
                    Excel formats in record time.
                </span>
                {/* <button
              type="button"
              className={cn(
                "cursor-pointer text-xs rounded-md px-2 py-2 ml-8 text-white flex justify-between items-center border border-white"
              )}
            >
              Request a demo
              <div className={"ml-2"}>
                <BeIcon size={15} name={"chevron_right_white"} />
              </div>
            </button> */}
            </div>

        </footer>
    )
}

export default AppFooter