FTV-release tool
=========

This release tool is a CLI tool that helps you make releases of your libs.

This tool works only to release a forked project to its parent

**The different steps are :**
- Get the version defined on your bower.json or package.json
- Create a temporary branch based on the upstream/master
- Merge the working branch into the temporary one in no fast-forward mode
- Launch some grunt tasks (default & check-coverage)
- Add the generated files on the merge commit
- Create a tag based on the version number
- Push the temporary branch to overwrite the upstream/master one
- Push the tag to upstream
