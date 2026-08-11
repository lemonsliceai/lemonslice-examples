import uvicorn


def main() -> None:
    uvicorn.run("lemonslice_bridge.server:app", host="127.0.0.1", port=3001, reload=True)


if __name__ == "__main__":
    main()
